import type { FastifyPluginAsync } from 'fastify';
import { dialerEngine } from '../dialer/engine.js';

export const dialerRoutes: FastifyPluginAsync = async (fastify) => {
  // Start dialing session for a campaign
  fastify.post<{ Body: { campaignId: number } }>('/start', async (request, reply) => {
    try {
      await dialerEngine.startSession(request.body.campaignId);
      return { status: 'started' };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Pause auto-advance
  fastify.post('/pause', async (_request, reply) => {
    try {
      dialerEngine.pauseSession();
      return { status: 'paused' };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Resume auto-advance
  fastify.post('/resume', async (_request, reply) => {
    try {
      await dialerEngine.resumeSession();
      return { status: 'resumed' };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Stop session entirely
  fastify.post('/stop', async (_request, reply) => {
    try {
      await dialerEngine.stopSession();
      return { status: 'stopped' };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Skip current contact
  fastify.post('/skip', async (_request, reply) => {
    try {
      await dialerEngine.skipCurrent();
      return { status: 'skipped' };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Jump in — bridge operator into active call
  fastify.post('/jump-in', async (_request, reply) => {
    try {
      await dialerEngine.jumpIn();
      return { status: 'bridged' };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Get current session state
  fastify.get('/status', async () => {
    return dialerEngine.getStatus();
  });
};
