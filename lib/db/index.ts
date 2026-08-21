import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWs } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { neon, Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
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

function isNeonUrl(url: string): boolean {
  return url.includes('neon.tech');
}

let httpInstance: ReturnType<typeof drizzleHttp<typeof schema>> | null = null;
let wsInstance: ReturnType<typeof drizzleWs<typeof schema>> | null = null;
let nodePgInstance: ReturnType<typeof drizzleNodePg<typeof schema>> | null = null;

/**
 * Returns the Neon HTTP Drizzle client (or node-postgres in local/CI standard PostgreSQL environments).
 * Optimized for single-statement reads and writes in serverless execution (AD-04, doc 3 §6).
 */
export function getDb() {
  const url = getDatabaseUrl();
  if (isNeonUrl(url)) {
    if (!httpInstance) {
      const sql = neon(url);
      httpInstance = drizzleHttp({ client: sql, schema });
    }
    return httpInstance;
  }

  if (!nodePgInstance) {
    const pool = new PgPool({ connectionString: url });
    nodePgInstance = drizzleNodePg({ client: pool, schema });
  }
  return nodePgInstance;
}

/**
 * Returns the Neon WebSocket Pool Drizzle client (or node-postgres in local/CI standard PostgreSQL environments).
 * Dedicated for interactive multi-statement transactions (e.g. transfer pair atomicity, doc 3 §6).
 */
export function getPoolDb() {
  const unpooledUrl = getUnpooledDatabaseUrl();
  if (isNeonUrl(unpooledUrl)) {
    if (!wsInstance) {
      const pool = new NeonPool({ connectionString: unpooledUrl });
      wsInstance = drizzleWs({ client: pool, schema });
    }
    return wsInstance;
  }

  return getDb();
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
