// server/utils/metrics.ts
import { Counter, register, collectDefaultMetrics, Histogram, Summary, Registry } from 'prom-client';
import { query } from './prisma';
import { scopedLogger } from './logger';

const log = scopedLogger('metrics');

// Detect Node.js vs Cloudflare Workers
const isNodeEnv = typeof process !== 'undefined' && process.versions?.node;

let fs: typeof import('fs') | null = null;
let path: typeof import('path') | null = null;
let fsInitialized = false;

async function initFs() {
  if (fsInitialized || !isNodeEnv) return;
  try {
    const fsModule = await import('fs');
    const pathModule = await import('path');
    fs = fsModule.default || fsModule;
    path = pathModule.default || pathModule;
    fsInitialized = true;
  } catch {
    fsInitialized = true; // skip in Workers
  }
}

// File names for persisted metrics
const METRICS_FILE = '.metrics.json';
const METRICS_DAILY_FILE = '.metrics_daily.json';
const METRICS_WEEKLY_FILE = '.metrics_weekly.json';
const METRICS_MONTHLY_FILE = '.metrics_monthly.json';

// Registries
const registries = {
  default: register,
  daily: new Registry(),
  weekly: new Registry(),
  monthly: new Registry(),
};

// Cloudflare-safe global exposure
if (typeof globalThis !== 'undefined') {
  (globalThis as any).metrics_daily = registries.daily;
  (globalThis as any).metrics_weekly = registries.weekly;
  (globalThis as any).metrics_monthly = registries.monthly;
}

// Metrics store
export type Metrics = {
  user: Counter<'namespace'>;
  captchaSolves: Counter<'success'>;
  providerHostnames: Counter<'hostname'>;
  providerStatuses: Counter<'provider_id' | 'status'>;
  watchMetrics: Counter<'title' | 'tmdb_full_id' | 'provider_id' | 'success'>;
  toolMetrics: Counter<'tool'>;
  httpRequestDuration: Histogram<'method' | 'route' | 'status_code'>;
  httpRequestSummary: Summary<'method' | 'route' | 'status_code'>;
};

const metricsStore: Record<string, Metrics | null> = {
  default: null,
  daily: null,
  weekly: null,
  monthly: null,
};

// Helper to get registry or metrics
export function getRegistry(interval: 'default' | 'daily' | 'weekly' | 'monthly' = 'default') {
  return registries[interval];
}

export function getMetrics(interval: 'default' | 'daily' | 'weekly' | 'monthly' = 'default') {
  if (!metricsStore[interval]) throw new Error(`metrics for ${interval} not initialized`);
  return metricsStore[interval];
}

// File helpers
function getMetricsFileName(interval: string = 'default') {
  switch (interval) {
    case 'daily': return METRICS_DAILY_FILE;
    case 'weekly': return METRICS_WEEKLY_FILE;
    case 'monthly': return METRICS_MONTHLY_FILE;
    default: return METRICS_FILE;
  }
}

async function createMetrics(registry: Registry, interval: string): Promise<Metrics> {
  const suffix = interval !== 'default' ? `_${interval}` : '';
  return {
    user: new Counter({ name: `mw_user_count${suffix}`, help: `Number of users (${interval})`, labelNames: ['namespace'], registers: [registry] }),
    captchaSolves: new Counter({ name: `mw_captcha_solves${suffix}`, help: `Captcha solves (${interval})`, labelNames: ['success'], registers: [registry] }),
    providerHostnames: new Counter({ name: `mw_provider_hostname_count${suffix}`, help: `Provider hostnames (${interval})`, labelNames: ['hostname'], registers: [registry] }),
    providerStatuses: new Counter({ name: `mw_provider_status_count${suffix}`, help: `Provider statuses (${interval})`, labelNames: ['provider_id', 'status'], registers: [registry] }),
    watchMetrics: new Counter({ name: `mw_media_watch_count${suffix}`, help: `Media watch events (${interval})`, labelNames: ['title','tmdb_full_id','provider_id','success'], registers: [registry] }),
    toolMetrics: new Counter({ name: `mw_provider_tool_count${suffix}`, help: `Tool usage (${interval})`, labelNames: ['tool'], registers: [registry] }),
    httpRequestDuration: new Histogram({ name: `http_request_duration_seconds${suffix}`, help: `HTTP request duration (${interval})`, labelNames: ['method','route','status_code'], buckets: [0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5,10], registers: [registry] }),
    httpRequestSummary: new Summary({ name: `http_request_summary_seconds${suffix}`, help: `HTTP request summary (${interval})`, labelNames: ['method','route','status_code'], percentiles: [0.01,0.05,0.5,0.9,0.95,0.99,0.999], registers: [registry] }),
  };
}

// Node-only FS persistence
export async function saveMetricsToFile(interval: string = 'default') {
  await initFs();
  if (!isNodeEnv || !fs) return;
  try {
    const registry = registries[interval];
    if (!registry) return;
    const fileName = getMetricsFileName(interval);
    const metricsData = await registry.getMetricsAsJSON();
    const filtered = metricsData.filter(m => m.name.startsWith('mw_') || m.name.startsWith('http_request'));
    fs.writeFileSync(fileName, JSON.stringify(filtered, null, 2));
    log.info(`${interval} metrics saved`, { interval });
  } catch (err) {
    log.error(`Failed to save ${interval} metrics`, { interval, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function loadMetricsFromFile(interval: string = 'default'): Promise<any[]> {
  await initFs();
  if (!isNodeEnv || !fs) return [];
  try {
    const fileName = getMetricsFileName(interval);
    if (!fs.existsSync(fileName)) return [];
    const data = fs.readFileSync(fileName, 'utf8');
    const parsed = JSON.parse(data);
    log.info(`Loaded saved ${interval} metrics`, { interval, count: parsed.length });
    return parsed;
  } catch (err) {
    log.error(`Failed to load ${interval} metrics`, { interval, error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// Track registration
let defaultMetricsRegistered = false;
const metricsRegistered: Record<string, boolean> = { default: false, daily: false, weekly: false, monthly: false };

// Setup metrics (Cloudflare-safe)
export async function setupMetrics(interval: 'default'|'daily'|'weekly'|'monthly' = 'default', clear = false) {
  try {
    log.info(`Setting up ${interval} metrics...`);
    const registry = registries[interval];

    if (clear) {
      registry.clear();
      metricsRegistered[interval] = false;
      if (interval === 'default') defaultMetricsRegistered = false;

      // Delete persisted file in Node
      await initFs();
      if (fs && isNodeEnv) {
        const fileName = getMetricsFileName(interval);
        if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
      }
    }

    if (!metricsRegistered[interval]) {
      if (interval === 'default' && !defaultMetricsRegistered) {
        collectDefaultMetrics({ register: registry });
        defaultMetricsRegistered = true;
      }
      metricsStore[interval] = await createMetrics(registry, interval);
      metricsRegistered[interval] = true;
    }

    // Restore metrics from file (Node only)
    if (isNodeEnv && !clear) {
      const saved = await loadMetricsFromFile(interval);
      if (saved.length > 0 && metricsStore[interval]) {
        saved.forEach(metric => {
          metric.values?.forEach(value => {
            const baseName = metric.name.replace(/_daily$|_weekly$|_monthly$/, '');
            switch (baseName) {
              case 'mw_user_count': metricsStore[interval]!.user.inc(value.labels, value.value); break;
              case 'mw_captcha_solves': metricsStore[interval]!.captchaSolves.inc(value.labels, value.value); break;
              case 'mw_provider_hostname_count': metricsStore[interval]!.providerHostnames.inc(value.labels, value.value); break;
              case 'mw_provider_status_count': metricsStore[interval]!.providerStatuses.inc(value.labels, value.value); break;
              case 'mw_media_watch_count': metricsStore[interval]!.watchMetrics.inc(value.labels, value.value); break;
              case 'mw_provider_tool_count': metricsStore[interval]!.toolMetrics.inc(value.labels, value.value); break;
            }
          });
        });
      }
    }

    // Attempt DB update for default only
    if (interval === 'default') {
      try { await updateMetrics(interval); } catch {}
    }

    await saveMetricsToFile(interval);
  } catch (err) {
    log.error(`Failed to setup ${interval} metrics`, { interval, error: err instanceof Error ? err.message : String(err) });
  }
}

// DB-backed metrics update
export async function updateMetrics(interval: 'default'|'daily'|'weekly'|'monthly' = 'default') {
  if (interval !== 'default') return;

  const metrics = metricsStore[interval];
  if (!metrics) return;

  metrics.user.reset();

  // Replace Prisma groupBy with raw SQL using your query() helper
  const result = await query(`
    SELECT namespace, COUNT(*) as count
    FROM users
    GROUP BY namespace
  `);

  result.rows.forEach((u: { namespace: string; count: number }) => {
    metrics.user.inc({ namespace: u.namespace }, u.count);
  });
}


// Export helpers for HTTP requests / provider / captcha
export function recordHttpRequest(method: string, route: string, statusCode: number, duration: number) {
  const labels = { method, route, status_code: statusCode.toString() };
  Object.values(metricsStore).forEach(m => { if (m) { m.httpRequestDuration.observe(labels,duration); m.httpRequestSummary.observe(labels,duration); } });
}

export function recordProviderMetrics(items: any[], hostname: string, tool?: string) {
  Object.values(metricsStore).forEach(m => {
    if (!m) return;
    m.providerHostnames.inc({ hostname });
    items.forEach(item => m.providerStatuses.inc({ provider_id: item.embedId ?? item.providerId, status: item.status }));
    const lastItem = items[items.length-1];
    const lastSuccessful = items.find(i=>i.status==='success');
    if (lastItem) m.watchMetrics.inc({ tmdb_full_id: lastItem.type+'-'+lastItem.tmdbId, provider_id: lastSuccessful?.providerId??lastItem.providerId, title: lastItem.title, success: (!!lastSuccessful).toString() });
    if (tool) m.toolMetrics.inc({ tool });
  });
}

export function recordCaptchaMetrics(success: boolean) {
  Object.values(metricsStore).forEach(m => m?.captchaSolves.inc({ success: success.toString() }));
}

// Initialize all intervals
export async function initializeAllMetrics() {
  for (const interval of ['default','daily','weekly','monthly'] as const) {
    await setupMetrics(interval);
  }
}
