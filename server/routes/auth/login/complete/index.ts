import { z } from 'zod';
import { useChallenge } from '~/utils/challenge';
import { useAuth } from '~/utils/auth';
import { prisma } from '~/utils/prisma';
import { ensureMetricsInitialized } from '~/utils/metric-init';

const completeSchema = z.object({
  publicKey: z.string(),
  challenge: z.object({
    code: z.string(),
    signature: z.string(),
  }),
  device: z.string().max(500).min(1),
});

export default defineEventHandler(async (event) => {
  // Workers-safe metrics initialization
  await ensureMetricsInitialized();

  const body = await readBody(event);

  const result = completeSchema.safeParse(body);
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid request body',
    });
  }

  const challenge = useChallenge();
  await challenge.verifyChallengeCode(
    body.challenge.code,
    body.publicKey,
    body.challenge.signature,
    'login',
    'mnemonic'
  );

  const user = await prisma.users.findUnique({
    where: { public_key: body.publicKey },
  });

  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'User cannot be found',
    });
  }

  // Update last login timestamp
  await prisma.users.update({
    where: { id: user.id },
    data: { last_logged_in: new Date() },
  });

  const auth = useAuth();
  const userAgent = getRequestHeader(event, 'user-agent') || '';
  const session = await auth.makeSession(user.id, body.device, userAgent);
  const token = auth.makeSessionToken(session);

  return {
    user: {
      id: user.id,
      publicKey: user.public_key,
      namespace: user.namespace,
      profile: user.profile,
      permissions: user.permissions,
    },
    session: {
      id: session.id,
      user: session.user,
      createdAt: session.created_at,
      accessedAt: session.accessed_at,
      expiresAt: session.expires_at,
      device: session.device,
      userAgent: session.user_agent,
    },
    token,
  };
});
