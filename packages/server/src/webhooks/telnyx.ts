import type { FastifyPluginAsync } from 'fastify';
import { dialerEngine } from '../dialer/engine.js';
import { getSession, updateSession } from '../dialer/state.js';
import { getProvider } from '../providers/index.js';
import { broadcast } from '../ws/index.js';
import { db } from '../db/index.js';
import { campaigns, recordings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';

// AMD timeout — if detection doesn't fire within 35s of call.answered, treat as human
const AMD_TIMEOUT_MS = 35_000;
let amdTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

function clearAmdTimeout() {
  if (amdTimeoutHandle) {
    clearTimeout(amdTimeoutHandle);
    amdTimeoutHandle = null;
  }
}

interface TelnyxEvent {
  data: {
    event_type: string;
    payload: {
      call_control_id: string;
      call_leg_id?: string;
      client_state?: string;
      result?: string;
      from?: string;
      to?: string;
      [key: string]: unknown;
    };
  };
}

function decodeClientState(encoded?: string): Record<string, unknown> {
  if (!encoded) return {};
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
  } catch {
    return {};
  }
}

export const telnyxWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/telnyx', async (request, reply) => {
    const event = request.body as TelnyxEvent;
    const { event_type, payload } = event.data;
    const { call_control_id, client_state } = payload;
    const state = decodeClientState(client_state);

    fastify.log.info({ event_type, call_control_id }, 'Telnyx webhook received');

    const session = getSession();

    try {
      switch (event_type) {
        case 'call.initiated': {
          updateSession({ currentCallState: 'ringing' });
          broadcast({
            type: 'call_status_changed',
            data: { callState: 'ringing', contactId: session.currentContactId },
          });
          break;
        }

        case 'call.answered': {
          // AMD is enabled, so wait for detection result
          updateSession({ currentCallState: 'amd_detecting' });
          broadcast({
            type: 'call_status_changed',
            data: { callState: 'amd_detecting', contactId: session.currentContactId },
          });

          // Safety timeout — if AMD detection never fires, treat as human
          clearAmdTimeout();
          amdTimeoutHandle = setTimeout(() => {
            const currentSession = getSession();
            if (currentSession.currentCallState === 'amd_detecting') {
              fastify.log.warn({ call_control_id }, 'AMD timeout — no detection result received');
              updateSession({ currentCallState: 'human_answered' });
              broadcast({
                type: 'call_status_changed',
                data: {
                  callState: 'human_answered',
                  contactId: currentSession.currentContactId,
                  message: 'AMD timed out — treating as human. Ready to jump in.',
                },
              });
            }
          }, AMD_TIMEOUT_MS);
          break;
        }

        case 'call.machine.detection.ended': {
          const result = payload.result;
          clearAmdTimeout();

          if (result === 'machine') {
            // Wait for greeting to end (beep detection)
            updateSession({ currentCallState: 'voicemail_dropping' });
            broadcast({
              type: 'call_status_changed',
              data: { callState: 'voicemail_dropping', contactId: session.currentContactId },
            });
          } else if (result === 'not_sure') {
            // AMD couldn't determine — treat as human but warn the operator
            fastify.log.warn({ call_control_id }, 'AMD returned not_sure — treating as human');
            updateSession({ currentCallState: 'human_answered' });
            broadcast({
              type: 'call_status_changed',
              data: {
                callState: 'human_answered',
                contactId: session.currentContactId,
                message: 'AMD inconclusive — could be human or machine. Ready to jump in.',
              },
            });

            try {
              await playOpener(call_control_id, session.campaignId, state);
            } catch (err: any) {
              fastify.log.error({ err, call_control_id }, 'Failed to play opener after not_sure AMD');
              broadcast({
                type: 'error',
                data: { message: `Failed to play opener: ${err.message}` },
              });
            }
          } else {
            // Human answered — play opener
            updateSession({ currentCallState: 'human_answered' });
            broadcast({
              type: 'call_status_changed',
              data: {
                callState: 'human_answered',
                contactId: session.currentContactId,
                message: 'Human answered — ready to jump in!',
              },
            });

            try {
              await playOpener(call_control_id, session.campaignId, state);
            } catch (err: any) {
              fastify.log.error({ err, call_control_id }, 'Failed to play opener');
              broadcast({
                type: 'error',
                data: { message: `Failed to play opener: ${err.message}` },
              });
            }
          }
          break;
        }

        case 'call.machine.greeting.ended': {
          // Beep detected — drop voicemail
          try {
            await playVoicemail(call_control_id, session.campaignId, state);
          } catch (err: any) {
            fastify.log.error({ err, call_control_id }, 'Failed to play voicemail drop');
            broadcast({
              type: 'error',
              data: { message: `Failed to drop voicemail: ${err.message}` },
            });
            // Hangup and move on since we can't drop the voicemail
            try {
              const provider = await getProvider();
              await provider.hangup(call_control_id);
            } catch {
              // Call may have already ended
            }
            await dialerEngine.handleCallEnd(call_control_id, 'no_answer');
          }
          break;
        }

        case 'call.playback.ended': {
          const playbackContext = state.playbackType as string | undefined;

          if (playbackContext === 'voicemail') {
            // Voicemail dropped — hangup and move on
            try {
              const provider = await getProvider();
              await provider.hangup(call_control_id);
            } catch {
              // Call may have already ended
            }
            await dialerEngine.handleCallEnd(call_control_id, 'voicemail');
          } else if (playbackContext === 'opener') {
            // Opener finished — wait for operator to jump in
            updateSession({ currentCallState: 'human_answered' });
            broadcast({
              type: 'call_status_changed',
              data: {
                callState: 'human_answered',
                contactId: session.currentContactId,
                message: 'Opener finished — jump in now!',
              },
            });
          }
          break;
        }

        case 'call.hangup': {
          clearAmdTimeout();
          const currentState = session.currentCallState;
          // Determine disposition based on state
          let disposition = 'no_answer';
          if (currentState === 'voicemail_dropping') disposition = 'voicemail';
          else if (currentState === 'operator_bridged' || currentState === 'human_answered')
            disposition = 'connected';

          await dialerEngine.handleCallEnd(call_control_id, disposition);
          break;
        }

        default: {
          fastify.log.info({ event_type }, 'Unhandled Telnyx event');
        }
      }
    } catch (err: any) {
      fastify.log.error({ err, event_type }, 'Error handling webhook');
      broadcast({ type: 'error', data: { message: err.message } });
    }

    // Always respond 200 to Telnyx
    return reply.code(200).send({ received: true });
  });
};

async function playOpener(callControlId: string, campaignId: number, state: Record<string, unknown>) {
  const campaign = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign?.openerRecordingId) return;

  const recording = await db
    .select()
    .from(recordings)
    .where(eq(recordings.id, campaign.openerRecordingId))
    .get();
  if (!recording) return;

  const provider = await getProvider();
  const webhookBase = config.WEBHOOK_BASE_URL;
  const audioUrl = `${webhookBase}${recording.filePath}`;

  const clientState = JSON.stringify({ ...state, playbackType: 'opener' });
  await provider.playAudio(callControlId, audioUrl, clientState);
}

async function playVoicemail(callControlId: string, campaignId: number, state: Record<string, unknown>) {
  const campaign = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign?.voicemailRecordingId) return;

  const recording = await db
    .select()
    .from(recordings)
    .where(eq(recordings.id, campaign.voicemailRecordingId))
    .get();
  if (!recording) return;

  const provider = await getProvider();
  const webhookBase = config.WEBHOOK_BASE_URL;
  const audioUrl = `${webhookBase}${recording.filePath}`;

  const clientState = JSON.stringify({ ...state, playbackType: 'voicemail' });
  await provider.playAudio(callControlId, audioUrl, clientState);
}
