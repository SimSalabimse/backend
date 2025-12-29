import { prisma } from './prisma';
import nacl from 'tweetnacl';

// Challenge code expires in 10 minutes
const CHALLENGE_EXPIRY_MS = 10 * 60 * 1000;

export function useChallenge() {
  const createChallengeCode = async (flow: string, authType: string) => {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + CHALLENGE_EXPIRY_MS);

    // Use Web Crypto UUID
    const code = crypto.randomUUID();

    return await prisma.challenge_codes.create({
      data: {
        code,
        flow,
        auth_type: authType,
        created_at: now,
        expires_at: expiryDate,
      },
    });
  };

  const verifyChallengeCode = async (
    code: string,
    publicKey: string,
    signature: string,
    flow: string,
    authType: string
  ) => {
    const challengeCode = await prisma.challenge_codes.findUnique({
      where: { code },
    });

    if (!challengeCode) throw new Error('Invalid challenge code');
    if (challengeCode.flow !== flow || challengeCode.auth_type !== authType)
      throw new Error('Invalid challenge flow or auth type');
    if (new Date(challengeCode.expires_at) < new Date()) throw new Error('Challenge code expired');

    const isValidSignature = verifySignature(code, publicKey, signature);
    if (!isValidSignature) throw new Error('Invalid signature');

    await prisma.challenge_codes.delete({ where: { code } });
    return true;
  };

  const verifySignature = (data: string, publicKey: string, signature: string) => {
    try {
      const sigUint8 = base64ToUint8Array(signature);
      const pubUint8 = base64ToUint8Array(publicKey);
      const msgUint8 = new TextEncoder().encode(data);

      return nacl.sign.detached.verify(msgUint8, sigUint8, pubUint8);
    } catch (err) {
      console.error('Signature verification error:', err);
      return false;
    }
  };

  // Cloudflare-safe Base64 decoding
  const base64ToUint8Array = (str: string) => {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const decoded = atob(str); // Web standard
    const arr = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) arr[i] = decoded.charCodeAt(i);
    return arr;
  };

  return {
    createChallengeCode,
    verifyChallengeCode,
  };
}
