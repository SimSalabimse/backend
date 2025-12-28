// server/utils/metric-init.ts
import { initializeAllMetrics } from './metrics';
import { scopedLogger } from './logger';

const log = scopedLogger('metric-init');

let metricsInitialized = false;

// Cloudflare-safe async initializer
export async function ensureMetricsInitialized() {
  if (metricsInitialized) return;

  try {
    log.info('Initializing metrics...');
    await initializeAllMetrics();
    metricsInitialized = true;
    log.info('Metrics initialized.');
  } catch (error) {
    log.error('Failed to initialize metrics', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('metrics not initialized');
  }
}
