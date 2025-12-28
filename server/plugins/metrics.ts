import { defineNitroPlugin } from '#imports';
import { initializeAllMetrics } from '../utils/metrics';
import { scopedLogger } from '../utils/logger';

const log = scopedLogger('metrics-plugin');

export default defineNitroPlugin(async (nitroApp) => {
  // Skip metrics in serverless/edge environments
  // Metrics require file system and periodic intervals which aren't available
  if (import.meta.preset === 'cloudflare-module' || 
      import.meta.preset === 'cloudflare-pages' ||
      import.meta.preset === 'cloudflare') {
    log.info('Skipping metrics initialization (Cloudflare environment)');
    return;
  }

  try {
    log.info('Initializing metrics at startup...');
    await initializeAllMetrics();
    log.info('Metrics initialized.');
  } catch (error) {
    log.error('Failed to initialize metrics at startup', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});