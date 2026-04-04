import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { authCookie } from './setup.js';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import bcrypt from 'bcryptjs';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Auth API', () => {
  it('GET /api/auth/status returns auth status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBeDefined();
    expect(body.loggedIn).toBeDefined();
  });

  it('POST /api/auth/logout clears session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Logged out.');
  });
});

describe('Auth API — Multi-User Login', () => {
  let testUserEmail: string;
  const testPassword = 'testpassword123';

  beforeAll(async () => {
    // Create a test user directly in DB
    testUserEmail = `test-${Date.now()}@example.com`;
    const hash = await bcrypt.hash(testPassword, 10);
    await db.insert(users).values({
      email: testUserEmail,
      name: 'Test User',
      passwordHash: hash,
      role: 'operator',
      mustChangePassword: false,
      mustSetupMfa: false,
    });
  });

  it('POST /api/auth/login with valid credentials returns success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUserEmail, password: testPassword },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.message).toBe('Logged in.');
    // Should set a session cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
  });

  it('POST /api/auth/login with wrong password returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: testUserEmail, password: 'wrongpassword' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/auth/login with nonexistent email returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nonexistent@example.com', password: testPassword },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/auth/login with mustChangePassword returns requirePasswordChange', async () => {
    const pwChangeEmail = `pwchange-${Date.now()}@example.com`;
    const hash = await bcrypt.hash('temppass123', 10);
    await db.insert(users).values({
      email: pwChangeEmail,
      name: 'PW Change User',
      passwordHash: hash,
      role: 'operator',
      mustChangePassword: true,
      mustSetupMfa: false,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: pwChangeEmail, password: 'temppass123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().requirePasswordChange).toBe(true);
  });
});

describe('Auth API — Password Change', () => {
  let sessionCookie: string;
  const email = `changepw-${Date.now()}@example.com`;
  const currentPw = 'currentpass123';
  const newPw = 'brandnewpass456';

  beforeAll(async () => {
    const hash = await bcrypt.hash(currentPw, 10);
    await db.insert(users).values({
      email,
      name: 'Change PW User',
      passwordHash: hash,
      role: 'operator',
      mustChangePassword: true,
      mustSetupMfa: false,
    });

    // Login to get session
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: currentPw },
    });
    const setCookie = loginRes.headers['set-cookie'] as string;
    sessionCookie = setCookie.split(';')[0];
  });

  it('POST /api/auth/change-password succeeds with correct current password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie: sessionCookie },
      payload: { currentPassword: currentPw, newPassword: newPw },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Password changed.');
  });

  it('POST /api/auth/change-password rejects short passwords', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie: sessionCookie },
      payload: { currentPassword: newPw, newPassword: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/auth/change-password rejects wrong current password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie: sessionCookie },
      payload: { currentPassword: 'wrongpassword', newPassword: 'newvalidpass123' },
    });
    expect(res.statusCode).toBe(401);
  });
});
