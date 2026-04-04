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
export let TEST_USER_ID = 1;

beforeAll(async () => {
  // Dynamic imports to ensure DATABASE_URL is already set
  const { migrate } = await import('../db/migrate.js');
  await migrate();

  // Create a test admin user
  const { db } = await import('../db/index.js');
  const { users } = await import('../db/schema.js');
  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.hash('testadmin123', 10);
  const [user] = await db
    .insert(users)
    .values({
      email: 'testadmin@test.com',
      name: 'Test Admin',
      passwordHash: hash,
      role: 'admin',
      mustChangePassword: false,
      mustSetupMfa: false,
    })
    .returning();
  TEST_USER_ID = user.id;

  // Create test session with the real user
  const { sessions, resetMultiUserCache } = await import('../routes/auth.js');
  sessions.set(TEST_SESSION_ID, { userId: TEST_USER_ID, role: 'admin', createdAt: Date.now() });
  resetMultiUserCache();
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
