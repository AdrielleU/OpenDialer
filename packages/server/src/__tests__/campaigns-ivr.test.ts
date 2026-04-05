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

describe('Campaign IVR & Call Behavior', () => {
  let campaignId: number;

  it('creates a campaign with IVR sequence and dropIfNoOperator', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie: authCookie() },
      payload: {
        name: 'IVR Campaign',
        callerId: '+15551234567',
        ivrSequence: 'WWW1WW3',
        dropIfNoOperator: true,
        ivrGreetingType: 'tts',
        ivrGreetingTemplate: 'Hi, calling about claim {{notes}} for {{name}}.',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    campaignId = body.id;
    expect(body.name).toBe('IVR Campaign');
  });

  it('GET returns IVR fields', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/campaigns/${campaignId}`,
      headers: { cookie: authCookie() },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ivrSequence).toBe('WWW1WW3');
    expect(body.dropIfNoOperator).toBe(true);
    expect(body.ivrGreetingType).toBe('tts');
    expect(body.ivrGreetingTemplate).toBe('Hi, calling about claim {{notes}} for {{name}}.');
  });

  it('updates IVR fields', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${campaignId}`,
      headers: { cookie: authCookie() },
      payload: {
        ivrSequence: 'WW2WW1',
        dropIfNoOperator: false,
        ivrGreetingType: 'recording',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ivrSequence).toBe('WW2WW1');
    expect(body.dropIfNoOperator).toBe(false);
    expect(body.ivrGreetingType).toBe('recording');
  });

  it('creates a campaign with defaults (no IVR)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { cookie: authCookie() },
      payload: { name: 'No IVR Campaign', callerId: '+15559876543' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ivrSequence).toBeNull();
    expect(body.dropIfNoOperator).toBe(true);
    expect(body.ivrGreetingType).toBe('none');
    expect(body.ivrGreetingTemplate).toBeNull();
  });

  afterAll(async () => {
    if (campaignId) {
      await app.inject({
        method: 'DELETE',
        url: `/api/campaigns/${campaignId}`,
        headers: { cookie: authCookie() },
      });
    }
  });
});
