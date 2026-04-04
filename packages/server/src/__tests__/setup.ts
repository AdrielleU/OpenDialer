import { beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { migrate } from '../db/migrate.js';

// Use a temp directory for test database
const testDir = mkdtempSync(join(tmpdir(), 'opendialer-test-'));
const testDbPath = join(testDir, 'test.db');

process.env.DATABASE_URL = testDbPath;
process.env.PROVIDER = 'telnyx';

beforeAll(async () => {
  await migrate();
});

afterAll(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {}
});
