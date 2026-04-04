import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbUrl = process.env.DATABASE_URL || './data/opendialer.db';
const authToken = process.env.DATABASE_AUTH_TOKEN;

function isRemoteUrl(url: string): boolean {
  return url.startsWith('libsql://') || url.startsWith('https://') || url.startsWith('http://');
}

// Only create local directory for file-based SQLite
if (!isRemoteUrl(dbUrl)) {
  const dir = dirname(dbUrl.replace('file:', ''));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

const client = createClient(
  isRemoteUrl(dbUrl)
    ? { url: dbUrl, authToken }
    : { url: `file:${dbUrl.replace('file:', '')}` },
);

export const db = drizzle(client, { schema });
