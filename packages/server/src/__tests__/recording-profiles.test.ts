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

describe('Recording Profiles API', () => {
  let profileId: number;

  it('GET /api/recording-profiles returns empty list initially', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/recording-profiles',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('POST /api/recording-profiles creates a profile', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/recording-profiles',
      headers: { cookie: authCookie() },
      payload: { name: 'Cold Outreach', isDefault: true },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe('Cold Outreach');
    expect(body.isDefault).toBe(true);
    expect(body.id).toBeDefined();
    profileId = body.id;
  });

  it('POST /api/recording-profiles rejects empty name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/recording-profiles',
      headers: { cookie: authCookie() },
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/recording-profiles lists created profiles', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/recording-profiles',
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    const profiles = res.json();
    expect(profiles.length).toBeGreaterThanOrEqual(1);
    expect(profiles.some((p: any) => p.name === 'Cold Outreach')).toBe(true);
  });

  it('PUT /api/recording-profiles/:id updates a profile', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/recording-profiles/${profileId}`,
      headers: { cookie: authCookie() },
      payload: { name: 'Updated Outreach' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Updated Outreach');
  });

  it('PUT /api/recording-profiles/:id/activate sets profile as default', async () => {
    // Create a second profile
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/recording-profiles',
      headers: { cookie: authCookie() },
      payload: { name: 'Follow Up' },
    });
    const secondId = createRes.json().id;

    // Activate the second one
    const res = await app.inject({
      method: 'PUT',
      url: `/api/recording-profiles/${secondId}/activate`,
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);

    // Check the first one lost default status
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/recording-profiles',
      headers: { cookie: authCookie() },
    });
    const profiles = listRes.json();
    const firstProfile = profiles.find((p: any) => p.id === profileId);
    const secondProfile = profiles.find((p: any) => p.id === secondId);
    expect(firstProfile.isDefault).toBe(false);
    expect(secondProfile.isDefault).toBe(true);
  });

  it('DELETE /api/recording-profiles/:id deletes a profile', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/recording-profiles/${profileId}`,
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(204);
  });

  it('PUT /api/recording-profiles/:id returns 404 for missing profile', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/recording-profiles/99999',
      headers: { cookie: authCookie() },
      payload: { name: 'Ghost' },
    });
    expect(res.statusCode).toBe(404);
  });
});
