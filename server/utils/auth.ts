import { query } from './prisma';
import jwt from 'jsonwebtoken';
const { sign, verify } = jwt;
import { randomUUID } from 'crypto';

// 21 days in ms
const SESSION_EXPIRY_MS = 21 * 24 * 60 * 60 * 1000;

export function useAuth() {
  const getSession = async (id: string) => {
    const result = await query(
      `SELECT * FROM sessions WHERE id = $1`,
      [id]
    );
    const session = result.rows[0];
    if (!session) return null;
    if (new Date(session.expires_at) < new Date()) return null;
    return session;
  };

  const getSessionAndBump = async (id: string) => {
    const session = await getSession(id);
    if (!session) return null;

    const now = new Date();
    const expiryDate = new Date(now.getTime() + SESSION_EXPIRY_MS);

    const result = await query(
      `UPDATE sessions SET accessed_at = $1, expires_at = $2 WHERE id = $3 RETURNING *`,
      [now.toISOString(), expiryDate.toISOString(), id]
    );
    return result.rows[0];
  };

  const makeSession = async (user: string, device: string, userAgent?: string) => {
    if (!userAgent) throw new Error('No userAgent provided');

    const now = new Date();
    const expiryDate = new Date(now.getTime() + SESSION_EXPIRY_MS);
    const id = randomUUID();

    const result = await query(
      `INSERT INTO sessions (id, user, device, user_agent, created_at, accessed_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, user, device, userAgent, now.toISOString(), now.toISOString(), expiryDate.toISOString()]
    );
    return result.rows[0];
  };

  const makeSessionToken = (session: { id: string }) => {
    const runtimeConfig = useRuntimeConfig();
    const cryptoSecret = runtimeConfig.cryptoSecret || process.env.CRYPTO_SECRET;
    if (!cryptoSecret) throw new Error('CRYPTO_SECRET is not set');

    return sign({ sid: session.id }, cryptoSecret, { algorithm: 'HS256' });
  };

  const verifySessionToken = (token: string) => {
    try {
      const runtimeConfig = useRuntimeConfig();
      const cryptoSecret = runtimeConfig.cryptoSecret || process.env.CRYPTO_SECRET;
      if (!cryptoSecret) return null;

      const payload = verify(token, cryptoSecret, { algorithms: ['HS256'] });
      if (typeof payload === 'string') return null;
      return payload as { sid: string };
    } catch {
      return null;
    }
  };

  const getCurrentSession = async () => {
    const event = useEvent();
    const authHeader = getRequestHeader(event, 'authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw createError({ statusCode: 401, message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const payload = verifySessionToken(token);
    if (!payload) throw createError({ statusCode: 401, message: 'Invalid token' });

    const session = await getSessionAndBump(payload.sid);
    if (!session) throw createError({ statusCode: 401, message: 'Session not found or expired' });

    return session;
  };

  return {
    getSession,
    getSessionAndBump,
    makeSession,
    makeSessionToken,
    verifySessionToken,
    getCurrentSession,
  };
}
