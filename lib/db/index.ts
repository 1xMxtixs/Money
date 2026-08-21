import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWs } from 'drizzle-orm/neon-serverless';
import { neon, Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as schema from './schema';

// Required in Node.js environments for Neon WebSocket pool connections
if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not configured in environment variables.');
  }
  return url;
}

function getUnpooledDatabaseUrl(): string {
  return process.env.DATABASE_URL_UNPOOLED || getDatabaseUrl();
}

let httpInstance: ReturnType<typeof drizzleHttp<typeof schema>> | null = null;
let wsInstance: ReturnType<typeof drizzleWs<typeof schema>> | null = null;
let poolInstance: Pool | null = null;

/**
 * Returns the Neon HTTP Drizzle client.
 * Optimized for single-statement reads and writes in serverless execution (AD-04, doc 3 §6).
 */
export function getDb() {
  if (!httpInstance) {
    const sql = neon(getDatabaseUrl());
    httpInstance = drizzleHttp({ client: sql, schema });
  }
  return httpInstance;
}

/**
 * Returns the Neon WebSocket Pool Drizzle client.
 * Dedicated for interactive multi-statement transactions (e.g. transfer pair atomicity, doc 3 §6).
 */
export function getPoolDb() {
  if (!wsInstance) {
    poolInstance = new Pool({ connectionString: getUnpooledDatabaseUrl() });
    wsInstance = drizzleWs({ client: poolInstance, schema });
  }
  return wsInstance;
}

// Proxied exports for direct convenience with safe lazy initialization
export const db = new Proxy({} as ReturnType<typeof drizzleHttp<typeof schema>>, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export const httpDb = db;

export const poolDb = new Proxy({} as ReturnType<typeof drizzleWs<typeof schema>>, {
  get(_target, prop, receiver) {
    const instance = getPoolDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

export const wsDb = poolDb;

export { schema };
