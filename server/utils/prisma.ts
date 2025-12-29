import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/client';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

// Lazily initialize adapter & client
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

// global singleton to avoid multiple instances in dev
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
