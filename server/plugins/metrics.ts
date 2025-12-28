import { defineNitroPlugin } from '#imports';
import { ensureMetricsInitialized } from '../utils/metric-init';
import { scopedLogger } from '../utils/logger';

const log = scopedLogger('metrics-plugin');

export default defineNitroPlugin(() => {
  // Skip initialization at plugin load in Cloudflare environments
  if (
    import.meta.preset === 'cloudflare-module' ||
    import.meta.preset === 'cloudflare-pages' ||
    import.meta.preset === 'cloudflare'
  ) {
    log.info('Skipping metrics initialization at startup (Cloudflare environment)');
    return;
  }

  // Node env: run async safely in a detached function
  (async () => {
    await ensureMetricsInitialized();
  })();
});
