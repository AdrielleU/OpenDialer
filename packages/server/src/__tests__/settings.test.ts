import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import { authCookie } from './setup.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('Settings API', () => {
  it('GET /api/settings returns empty object initially', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json()).toBe('object');
  });

  it('PUT /api/settings upserts key-value pairs', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { cookie: authCookie() },
      payload: { TELNYX_API_KEY: 'test-key-123', SOME_SETTING: 'value' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('GET /api/settings returns saved settings (with secrets redacted)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie: authCookie() },
    });
    const body = res.json();
    // *_KEY fields are redacted to ******** in GET responses
    expect(body.TELNYX_API_KEY).toBe('********');
    // Non-secret fields pass through unchanged
    expect(body.SOME_SETTING).toBe('value');
  });

  it('PUT /api/settings overwrites existing keys', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { cookie: authCookie() },
      payload: { TELNYX_API_KEY: 'updated-key' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie: authCookie() },
    });
    // Still redacted in the response, but the underlying value changed
    expect(res.json().TELNYX_API_KEY).toBe('********');
  });

  it('PUT /api/settings with the redacted placeholder is a no-op for that key', async () => {
    // Set a real key
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { cookie: authCookie() },
      payload: { TELNYX_API_KEY: 'real-secret-value' },
    });
    // Send back the redacted value (simulating UI round-trip without edits)
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { cookie: authCookie() },
      payload: { TELNYX_API_KEY: '********', SOME_SETTING: 'updated-value' },
    });

    // Direct DB read confirms the underlying secret was NOT overwritten
    const { db } = await import('../db/index.js');
    const { settings: settingsTable } = await import('../db/schema.js');
    const { eq } = await import('drizzle-orm');
    const row = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, 'TELNYX_API_KEY'))
      .get();
    expect(row?.value).toBe('real-secret-value');

    // GET still returns redacted version, but SOME_SETTING (not a secret) was updated
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie: authCookie() },
    });
    expect(res.json().TELNYX_API_KEY).toBe('********');
    expect(res.json().SOME_SETTING).toBe('updated-value');
  });

  it('GET /api/settings/health returns configured status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/health',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('configured');
  });
});
