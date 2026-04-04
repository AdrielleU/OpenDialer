import { beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Use a temp directory for test database
const testDir = mkdtempSync(join(tmpdir(), 'opendialer-test-'));
const testDbPath = join(testDir, 'test.db');

// IMPORTANT: Set env BEFORE any app modules are imported
process.env.DATABASE_URL = testDbPath;
process.env.PROVIDER = 'telnyx';

export const TEST_SESSION_ID = 'test-session-id';
export const SESSION_COOKIE_NAME = 'opendialer_session';

beforeAll(async () => {
  // Dynamic imports to ensure DATABASE_URL is already set
  const { migrate } = await import('../db/migrate.js');
  await migrate();

  const { sessions } = await import('../routes/auth.js');
  sessions.set(TEST_SESSION_ID, { createdAt: Date.now() });
});

afterAll(async () => {
  const { sessions } = await import('../routes/auth.js');
  sessions.delete(TEST_SESSION_ID);
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {}
});

// Helper to get auth cookie header for test requests
export function authCookie(): string {
  return `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`;
}
