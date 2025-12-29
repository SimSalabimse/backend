import { z } from 'zod';
import { useChallenge } from '~/utils/challenge';

const startSchema = z.object({
  captchaToken: z.string().optional(),
});

export default defineEventHandler(async event => {
  // Only allow POST
  if (event.node.req.method !== 'POST') {
    throw createError({
      statusCode: 405,
      message: 'HTTP method is not allowed. Use POST.',
    });
  }

  const body = await readBody(event);

  const result = startSchema.safeParse(body);
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid request body',
    });
  }

  try {
    const challenge = useChallenge();
    // Use Web Crypto-compatible randomUUID inside challenge
    const challengeCode = await challenge.createChallengeCode('registration', 'mnemonic');

    return {
      challenge: challengeCode.code,
    };
  } catch (err) {
    console.error('register/start error:', err);
    throw createError({
      statusCode: 500,
      message: (err as Error)?.message || 'Server error',
    });
  }
});
