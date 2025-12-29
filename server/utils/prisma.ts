import { Client } from '@neondatabase/serverless';

let clientInstance: Client | null = null;

export function getClient(): Client {
  if (!clientInstance) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }

    clientInstance = new Client({
      connectionString: process.env.DATABASE_URL,
    });
  }

  return clientInstance;
}

export async function query(sql: string, params?: any[]) {
  const client = getClient();
  return await client.query(sql, params);
}
