import type { FastifyPluginAsync } from 'fastify';
import { dialerEngine } from '../dialer/engine.js';
import {
  addOperator,
  removeOperator,
  setOperatorAvailability,
  setOperatorWebrtc,
  getOperator,
} from '../dialer/team-state.js';
import { broadcast } from '../ws/index.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getProvider } from '../providers/index.js';
import { config } from '../config.js';

export const dialerRoutes: FastifyPluginAsync = async (fastify) => {
  // Start dialing session for a campaign (admin only)
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

  // Skip a specific call (or the first in-flight call)
  fastify.post<{ Body: { callControlId?: string } }>('/skip', async (request, reply) => {
    try {
      const { callControlId } = (request.body || {}) as { callControlId?: string };
      if (callControlId) {
        await dialerEngine.skipCall(callControlId);
      } else {
        // Legacy: skip first in-flight call
        const status = dialerEngine.getStatus();
        const firstCall = status.inFlightCalls[0];
        if (firstCall) {
          await dialerEngine.skipCall(firstCall.callControlId);
        } else {
          throw new Error('No active call to skip');
        }
      }
      return { status: 'skipped' };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Jump in — bridge operator into a call (manual override)
  fastify.post<{ Body: { callControlId?: string } }>('/jump-in', async (request, reply) => {
    try {
      const userId = (request as any).userId as number;
      await dialerEngine.jumpIn(userId || undefined);
      return { status: 'bridged' };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Operator joins the active session
  fastify.post('/join', async (request, reply) => {
    const userId = (request as any).userId as number;
    if (!userId) return reply.code(400).send({ error: 'User ID required.' });

    const user = await db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return reply.code(404).send({ error: 'User not found.' });

    const op = addOperator(userId, user.name);

    broadcast({
      type: 'operator_status_changed',
      data: { operatorId: userId, name: user.name, availability: 'available' },
    });

    return {
      status: 'joined',
      operator: op,
      webrtcCredentials: user.sipUsername
        ? { login: user.sipUsername, password: user.sipPassword }
        : null,
    };
  });

  // Get WebRTC credentials for the authenticated operator (with lazy provisioning)
  fastify.get('/webrtc-credentials', async (request, reply) => {
    const userId = (request as any).userId as number;
    const user = await db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return reply.code(404).send({ error: 'User not found.' });

    // Return existing credentials
    if (user.sipUsername && user.sipPassword) {
      return { login: user.sipUsername, password: user.sipPassword };
    }

    // Lazy provisioning for users created before this feature
    const connectionId = config.TELNYX_CONNECTION_ID;
    if (!connectionId) {
      return reply.code(400).send({ error: 'TELNYX_CONNECTION_ID not configured.' });
    }

    try {
      const provider = await getProvider();
      const cred = await provider.provisionCredential(
        connectionId,
        `operator-${userId}-${user.email}`,
      );
      await db
        .update(users)
        .set({
          sipUsername: cred.sipUsername,
          sipPassword: cred.sipPassword,
          telnyxCredentialId: cred.id,
        })
        .where(eq(users.id, userId));
      return { login: cred.sipUsername, password: cred.sipPassword };
    } catch (err: any) {
      return reply.code(500).send({ error: 'Failed to provision WebRTC credentials.' });
    }
  });

  // Operator leaves the session
  fastify.post('/leave', async (request, reply) => {
    const userId = (request as any).userId as number;
    removeOperator(userId);

    broadcast({
      type: 'operator_status_changed',
      data: { operatorId: userId, availability: 'offline' },
    });

    return { status: 'left' };
  });

  // Register operator's WebRTC call leg
  fastify.post<{ Body: { callControlId: string } }>('/register-webrtc', async (request, reply) => {
    const userId = (request as any).userId as number;
    const { callControlId } = request.body as { callControlId: string };

    if (!callControlId) return reply.code(400).send({ error: 'callControlId required.' });

    setOperatorWebrtc(userId, callControlId);
    return { status: 'registered' };
  });

  // Operator marks self as available (after wrap-up)
  fastify.post('/set-available', async (request, reply) => {
    const userId = (request as any).userId as number;
    try {
      await dialerEngine.operatorReady(userId);
      return { status: 'available' };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Operator enters wrap-up mode
  fastify.post('/set-wrap-up', async (request, reply) => {
    const userId = (request as any).userId as number;
    setOperatorAvailability(userId, 'wrap_up');
    broadcast({
      type: 'operator_status_changed',
      data: { operatorId: userId, availability: 'wrap_up' },
    });
    return { status: 'wrap_up' };
  });

  // Stop playback and unmute operator — "Stop & Talk" button
  fastify.post<{ Body: { callControlId: string } }>('/stop-and-talk', async (request, reply) => {
    const userId = (request as any).userId as number;
    const { callControlId } = request.body as { callControlId: string };

    try {
      const provider = await getProvider();
      const operator = getOperator(userId);

      // Stop any playing audio on the call
      try {
        await provider.stopPlayback(callControlId);
      } catch {
        // Playback may have already ended
      }

      // Unmute the operator's WebRTC leg
      if (operator?.webrtcCallControlId) {
        try {
          await provider.unmute(operator.webrtcCallControlId);
        } catch {
          // May already be unmuted
        }
      }

      return { status: 'talking' };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Get current team session status
  fastify.get('/status', async () => {
    return dialerEngine.getStatus();
  });
};
