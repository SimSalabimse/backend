import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/client';

let prismaInstance: PrismaClient | null = null;
let adapterInstance: PrismaPg | null = null;

export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    // Initialize adapter lazily
    if (!adapterInstance) {
      adapterInstance = new PrismaPg({
        connectionString: process.env.DATABASE_URL,
      });
    }
    
    prismaInstance = new PrismaClient({ adapter: adapterInstance });
  }
  
  return prismaInstance;
}

// For backward compatibility with existing code
export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop) {
    return getPrisma()[prop as keyof PrismaClient];
  }
});