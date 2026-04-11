import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { dialerEngine } from '../dialer/engine.js';
import {
  addOperator,
  removeOperator,
  setOperatorAvailability,
  setOperatorWebrtc,
  getOperator,
  getInFlightCall,
  getTeamSession,
} from '../dialer/team-state.js';
import { handleOperatorDisconnect } from '../dialer/disconnect.js';
import { broadcast } from '../ws/index.js';
import { db } from '../db/index.js';
import { users, recordings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getProvider } from '../providers/index.js';
import { config } from '../config.js';
import { validate } from '../lib/validate.js';

const PlayRecordingSchema = z.object({
  callControlId: z.string().min(1),
  recordingId: z.number().int().positive(),
});

const SpeakSchema = z.object({
  callControlId: z.string().min(1),
  text: z.string().min(1).max(1000),
  voice: z.string().max(50).optional(),
});

// Returns true if the request is from an admin; otherwise sends 403 and returns false.
function requireAdmin(request: any, reply: any): boolean {
  if (request.userRole !== 'admin') {
    reply.code(403).send({ error: 'Admin access required.' });
    return false;
  }
  return true;
}

export const dialerRoutes: FastifyPluginAsync = async (fastify) => {
  // Start dialing session for a campaign (admin only).
  // Rate-limited to prevent runaway dial loops from a buggy script or a
  // compromised admin token burning through Telnyx minutes.
  fastify.post<{ Body: { campaignId: number } }>(
    '/start',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '5 minutes' },
      },
    },
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return;
      try {
        await dialerEngine.startSession(request.body.campaignId);
        return { status: 'started' };
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    },
  );

  // Pause auto-advance (admin only)
  fastify.post('/pause', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    try {
      dialerEngine.pauseSession();
      return { status: 'paused' };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Resume auto-advance (admin only)
  fastify.post('/resume', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    try {
      await dialerEngine.resumeSession();
      return { status: 'resumed' };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Stop session entirely (admin only)
  fastify.post('/stop', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
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

    // If a call is already waiting in the queue (humans answered while no
    // operator was free), route it to this newly-joined operator immediately
    // instead of waiting for the next dial batch tick. Fire-and-forget so
    // a routing failure doesn't break the join response.
    dialerEngine.tryRouteWaitingCall().catch((err) =>
      console.error('[dialer] tryRouteWaitingCall on join failed:', err?.message ?? err),
    );

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
    const operator = getOperator(userId);

    // If they were bridged into a call, run the disconnect / failover flow
    // so the contact gets a graceful "we'll follow up" message instead of
    // dead air. handleOperatorDisconnect already broadcasts offline status.
    if (operator?.bridgedToCallId) {
      try {
        await handleOperatorDisconnect(operator);
      } catch (err: any) {
        console.error('[dialer] leave failover failed:', err?.message ?? err);
      }
      removeOperator(userId);
      return { status: 'left' };
    }

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

  // Play a recording on the live call leg — operator soundboard
  fastify.post('/play-recording', async (request, reply) => {
    const userId = (request as any).userId as number;
    const body = validate(PlayRecordingSchema, request.body, reply);
    if (!body) return;
    const { callControlId, recordingId } = body;

    // Verify caller owns the call (must be the assigned operator)
    const call = getInFlightCall(callControlId);
    if (!call) return reply.code(404).send({ error: 'Call not found.' });
    if (call.assignedOperatorId !== userId) {
      return reply.code(403).send({ error: 'You are not the assigned operator on this call.' });
    }

    const recording = await db
      .select()
      .from(recordings)
      .where(eq(recordings.id, recordingId))
      .get();
    if (!recording) return reply.code(404).send({ error: 'Recording not found.' });

    try {
      const provider = await getProvider();
      const audioUrl = `${config.WEBHOOK_BASE_URL}${recording.filePath}`;
      const clientState = JSON.stringify({
        campaignId: getTeamSession().campaignId,
        contactId: call.contactId,
        playbackType: 'soundboard',
      });
      await provider.playAudio(callControlId, audioUrl, clientState);
      return { status: 'playing', recordingId };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // Speak text on the live call leg via Telnyx TTS — operator AI message box
  fastify.post('/speak', async (request, reply) => {
    const userId = (request as any).userId as number;
    const body = validate(SpeakSchema, request.body, reply);
    if (!body) return;
    const { callControlId, text, voice } = body;

    // Verify caller owns the call (must be the assigned operator)
    const call = getInFlightCall(callControlId);
    if (!call) return reply.code(404).send({ error: 'Call not found.' });
    if (call.assignedOperatorId !== userId) {
      return reply.code(403).send({ error: 'You are not the assigned operator on this call.' });
    }

    try {
      const provider = await getProvider();
      await provider.speak(callControlId, text, voice);
      return { status: 'speaking' };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
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
