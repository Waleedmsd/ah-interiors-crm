import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
const globalDb = globalThis as typeof globalThis & { ahPool?: Pool };
export function database() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be configured');
  const pool = globalDb.ahPool ??= new Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:5000});
  return drizzle(pool,{schema});
}
export async function closeDatabase() { await globalDb.ahPool?.end(); delete globalDb.ahPool; }
