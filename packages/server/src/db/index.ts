import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dbUrl = process.env.DATABASE_URL || './data/opendialer.db';

// Ensure the data directory exists
const dir = dirname(dbUrl.replace('file:', ''));
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const client = createClient({
  url: `file:${dbUrl.replace('file:', '')}`,
});

export const db = drizzle(client, { schema });
