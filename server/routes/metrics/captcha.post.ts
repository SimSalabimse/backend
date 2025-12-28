import { z } from 'zod';
import { recordCaptchaMetrics } from '~/utils/metrics';
import { scopedLogger } from '~/utils/logger';
import { ensureMetricsInitialized } from '~/plugins/metrics'; // reuse central initializer

const log = scopedLogger('metrics-captcha');

export default defineEventHandler(async (event) => {
  try {
    // Initialize metrics safely on first request
    await ensureMetricsInitialized();

    const body = await readBody(event);
    const validatedBody = z.object({
      success: z.boolean(),
    }).parse(body);

    recordCaptchaMetrics(validatedBody.success);

    return true;
  } catch (error) {
    log.error('Failed to process captcha metrics', {
      evt: 'metrics_error',
      error: error instanceof Error ? error.message : String(error),
    });

    throw createError({
      statusCode:
        error instanceof Error && error.message === 'metrics not initialized' ? 503 : 400,
      message: error instanceof Error ? error.message : 'Failed to process metrics',
    });
  }
});
