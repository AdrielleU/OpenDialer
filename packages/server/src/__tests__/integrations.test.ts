import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../app.js';
import { authCookie } from './setup.js';
import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

// Mock the HubSpot + webhook modules so the tests don't need a real HubSpot
// account and don't fire real outbound webhook requests.
vi.mock('../integrations/hubspot.js', () => ({
  testHubspotConnection: vi.fn(async () => ({ ok: true, message: 'mocked-ok' })),
  importHubspotContacts: vi.fn(async (campaignId: number, opts?: { limit?: number }) => ({
    imported: 0,
    campaignId,
    limit: opts?.limit ?? null,
  })),
  logCallToHubspot: vi.fn(async () => undefined),
}));

vi.mock('../integrations/webhooks.js', () => ({
  fireWebhook: vi.fn(async () => undefined),
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await db.delete(settings).where(eq(settings.key, 'WEBHOOK_CRM_URL'));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/integrations/hubspot/test', () => {
  it('returns the result of testHubspotConnection', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/integrations/hubspot/test',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, message: 'mocked-ok' });
  });
});

describe('POST /api/integrations/hubspot/import', () => {
  it('rejects when campaignId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/hubspot/import',
      headers: { cookie: authCookie() },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/campaignId/);
  });

  it('calls importHubspotContacts with the right args when campaignId is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/hubspot/import',
      headers: { cookie: authCookie() },
      payload: { campaignId: 42, limit: 100 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.imported).toBe(0);
    expect(body.campaignId).toBe(42);
    expect(body.limit).toBe(100);
  });
});

describe('POST /api/integrations/hubspot/log-call', () => {
  it('rejects when callLogId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/hubspot/log-call',
      headers: { cookie: authCookie() },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/callLogId/);
  });

  it('calls logCallToHubspot when callLogId is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/hubspot/log-call',
      headers: { cookie: authCookie() },
      payload: { callLogId: 7 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toMatch(/Call logged/);
  });
});

describe('POST /api/integrations/webhook/test', () => {
  it('returns 400 when WEBHOOK_CRM_URL is not configured', async () => {
    // Setting was wiped in beforeEach
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/webhook/test',
      headers: { cookie: authCookie() },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/WEBHOOK_CRM_URL/);
  });

  it('returns ok when WEBHOOK_CRM_URL is configured', async () => {
    await db
      .insert(settings)
      .values({ key: 'WEBHOOK_CRM_URL', value: 'https://example.com/webhook' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/webhook/test',
      headers: { cookie: authCookie() },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});
