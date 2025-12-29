import { randomUUID } from 'crypto';
import nacl from 'tweetnacl';
import { query } from './prisma';

// Challenge expires in 10 minutes
const CHALLENGE_EXPIRY_MS = 10 * 60 * 1000;

export function useChallenge() {
  const createChallengeCode = async (flow: string, authType: string) => {
    const code = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CHALLENGE_EXPIRY_MS);

    await query(
      `INSERT INTO challenge_codes (code, flow, auth_type, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [code, flow, authType, now.toISOString(), expiresAt.toISOString()]
    );

    return { code, expiresAt };
  };

  const verifyChallengeCode = async (
    code: string,
    publicKey: string,
    signature: string,
    flow: string,
    authType: string
  ) => {
    const res = await query(
      `SELECT * FROM challenge_codes WHERE code = $1`,
      [code]
    );

    if (res.rowCount === 0) throw new Error('Invalid challenge code');

    const challengeCode = res.rows[0];

    if (challengeCode.flow !== flow || challengeCode.auth_type !== authType) {
      throw new Error('Invalid challenge flow or auth type');
    }

    if (new Date(challengeCode.expires_at) < new Date()) {
      throw new Error('Challenge code expired');
    }

    if (!verifySignature(code, publicKey, signature)) {
      throw new Error('Invalid signature');
    }

    // Delete after verification
    await query(`DELETE FROM challenge_codes WHERE code = $1`, [code]);

    return true;
  };

  const verifySignature = (data: string, publicKey: string, signature: string) => {
    try {
      let sig = signature.replace(/-/g, '+').replace(/_/g, '/');
      while (sig.length % 4 !== 0) sig += '=';

      let pub = publicKey.replace(/-/g, '+').replace(/_/g, '/');
      while (pub.length % 4 !== 0) pub += '=';

      const signatureBuffer = Buffer.from(sig, 'base64');
      const publicKeyBuffer = Buffer.from(pub, 'base64');
      const messageBuffer = Buffer.from(data);

      return nacl.sign.detached.verify(messageBuffer, signatureBuffer, publicKeyBuffer);
    } catch (err) {
      console.error('Signature verification error:', err);
      return false;
    }
  };

  return {
    createChallengeCode,
    verifyChallengeCode,
  };
}
