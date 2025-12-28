import { defineTask } from '#imports';
import { scopedLogger } from '../../../utils/logger';
import { ensureMetricsInitialized } from '../../../utils/metric-init';

const logger = scopedLogger('tasks:clear-metrics:daily');

export default defineTask({
  meta: {
    name: "jobs:clear-metrics:daily",
    description: "Clear daily metrics at midnight",
  },
  async run() {
    logger.info("Clearing daily metrics");
    const startTime = Date.now();
    
    try {
      // Cloudflare-safe async metrics initializer
      await ensureMetricsInitialized();

      const executionTime = Date.now() - startTime;
      logger.info(`Daily metrics cleared in ${executionTime}ms`);
      
      return { 
        result: {
          status: "success",
          message: "Successfully cleared daily metrics",
          executionTimeMs: executionTime,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error("Error clearing daily metrics:", { error: error instanceof Error ? error.message : String(error) });
      return { 
        result: {
          status: "error",
          message: error instanceof Error ? error.message : "An error occurred clearing daily metrics",
          executionTimeMs: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };
    }
  },
}); 
