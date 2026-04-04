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

describe('Campaigns API', () => {
  let campaignId: number;

  it('POST /api/campaigns creates a campaign', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie: authCookie() },
      payload: { name: 'Test Campaign', callerId: '+15551234567' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe('Test Campaign');
    expect(body.callerId).toBe('+15551234567');
    expect(body.status).toBe('draft');
    expect(body.id).toBeDefined();
    campaignId = body.id;
  });

  it('GET /api/campaigns lists campaigns', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/campaigns',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/campaigns/:id returns a single campaign', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${campaignId}`,
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Test Campaign');
  });

  it('GET /api/campaigns/:id returns 404 for missing campaign', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/campaigns/99999',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /api/campaigns/:id updates a campaign', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${campaignId}`,
      headers: { cookie: authCookie() },
      payload: { name: 'Updated Campaign' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Updated Campaign');
  });

  it('DELETE /api/campaigns/:id deletes a campaign', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/campaigns/${campaignId}`,
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('DELETE /api/campaigns/:id returns 404 for missing campaign', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/campaigns/${campaignId}`,
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(404);
  });
});
