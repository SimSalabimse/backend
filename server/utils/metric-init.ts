import { initializeAllMetrics } from './metrics';
import { scopedLogger } from './logger';

const log = scopedLogger('metrics-init');

let isInitialized = false;

export async function ensureMetricsInitialized() {
  if (!isInitialized) {
    log.info('Initializing all metrics...', { evt: 'init_start' });
    await initializeAllMetrics();
    isInitialized = true;
    log.info('Metrics initialization complete', { evt: 'init_complete' });
  }
}
