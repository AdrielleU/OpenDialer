import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate as drizzleMigrate } from 'drizzle-orm/libsql/migrator';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export async function migrate() {
  const dbUrl = process.env.DATABASE_URL || './data/opendialer.db';
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  const isRemote =
    dbUrl.startsWith('libsql://') || dbUrl.startsWith('https://') || dbUrl.startsWith('http://');

  if (!isRemote) {
    const dir = dirname(dbUrl.replace('file:', ''));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const client = createClient(
    isRemote ? { url: dbUrl, authToken } : { url: `file:${dbUrl.replace('file:', '')}` },
  );

  const db = drizzle(client);
  const migrationsFolder = resolve(import.meta.dirname, '../../drizzle');

  await drizzleMigrate(db, { migrationsFolder });
}
