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
export const TEST_OPERATOR_SESSION_ID = 'test-operator-session-id';
export const SESSION_COOKIE_NAME = 'opendialer_session';
export let TEST_USER_ID = 1;
export let TEST_OPERATOR_USER_ID = 2;

beforeAll(async () => {
  // Dynamic imports to ensure DATABASE_URL is already set
  const { migrate } = await import('../db/migrate.js');
  await migrate();

  // Create a test admin user
  const { db } = await import('../db/index.js');
  const { users } = await import('../db/schema.js');
  const bcrypt = await import('bcryptjs');
  const adminHash = await bcrypt.hash('testadmin123', 10);
  const [admin] = await db
    .insert(users)
    .values({
      email: 'testadmin@test.com',
      name: 'Test Admin',
      passwordHash: adminHash,
      role: 'admin',
      mustChangePassword: false,
      mustSetupMfa: false,
    })
    .returning();
  TEST_USER_ID = admin.id;

  // Create a test operator user (for RBAC negative tests)
  const operatorHash = await bcrypt.hash('testoperator123', 10);
  const [operator] = await db
    .insert(users)
    .values({
      email: 'testoperator@test.com',
      name: 'Test Operator',
      passwordHash: operatorHash,
      role: 'operator',
      mustChangePassword: false,
      mustSetupMfa: false,
    })
    .returning();
  TEST_OPERATOR_USER_ID = operator.id;

  // Create test sessions for both users
  const { sessions } = await import('../routes/auth.js');
  sessions.set(TEST_SESSION_ID, { userId: TEST_USER_ID, role: 'admin', createdAt: Date.now() });
  sessions.set(TEST_OPERATOR_SESSION_ID, {
    userId: TEST_OPERATOR_USER_ID,
    role: 'operator',
    createdAt: Date.now(),
  });
});

afterAll(async () => {
  const { sessions } = await import('../routes/auth.js');
  sessions.delete(TEST_SESSION_ID);
  sessions.delete(TEST_OPERATOR_SESSION_ID);
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {}
});

// Helper to get admin auth cookie header for test requests
export function authCookie(): string {
  return `${SESSION_COOKIE_NAME}=${TEST_SESSION_ID}`;
}

// Helper to get operator auth cookie header for test requests
export function operatorAuthCookie(): string {
  return `${SESSION_COOKIE_NAME}=${TEST_OPERATOR_SESSION_ID}`;
}
