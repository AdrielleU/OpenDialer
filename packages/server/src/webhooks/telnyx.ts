import type { FastifyPluginAsync } from 'fastify';
import { dialerEngine } from '../dialer/engine.js';
import {
  getTeamSession,
  getInFlightCall,
  updateInFlightCall,
} from '../dialer/team-state.js';
import { getProvider } from '../providers/index.js';
import { broadcast } from '../ws/index.js';
import { db } from '../db/index.js';
import { campaigns, recordings, transcripts, callLogs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';

// AMD timeout — if detection doesn't fire within 35s of call.answered, treat as human
const AMD_TIMEOUT_MS = 35_000;
const amdTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function clearAmdTimeout(callControlId: string) {
  const handle = amdTimeouts.get(callControlId);
  if (handle) {
    clearTimeout(handle);
    amdTimeouts.delete(callControlId);
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
  // Store raw body for webhook signature verification
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as any).rawBody = body;
    try {
      done(null, JSON.parse(body as string));
    } catch (err: any) {
      done(err, undefined);
    }
  });

  fastify.post('/telnyx', async (request, reply) => {
    // Verify webhook signature if public key is configured
    const publicKey = config.TELNYX_PUBLIC_KEY;
    if (publicKey) {
      const signature = request.headers['telnyx-signature-ed25519'] as string | undefined;
      const timestamp = request.headers['telnyx-timestamp'] as string | undefined;

      if (!signature || !timestamp) {
        fastify.log.warn('Webhook missing signature headers');
        return reply.code(403).send({ error: 'Missing signature' });
      }

      try {
        const { verify } = await import('node:crypto');
        const rawBody = (request as any).rawBody as string;
        const signedPayload = `${timestamp}|${rawBody}`;
        const publicKeyBuffer = Buffer.from(publicKey, 'base64');
        const signatureBuffer = Buffer.from(signature, 'base64');
        const isValid = verify(null, Buffer.from(signedPayload), publicKeyBuffer, signatureBuffer);

        if (!isValid) {
          fastify.log.warn('Webhook signature verification failed');
          return reply.code(403).send({ error: 'Invalid signature' });
        }

        const webhookTime = parseInt(timestamp, 10) * 1000;
        if (Math.abs(Date.now() - webhookTime) > 5 * 60 * 1000) {
          fastify.log.warn('Webhook timestamp too old');
          return reply.code(403).send({ error: 'Timestamp expired' });
        }
      } catch (err: any) {
        fastify.log.error({ err }, 'Webhook signature verification error');
        return reply.code(403).send({ error: 'Signature verification failed' });
      }
    }

    const event = request.body as TelnyxEvent;
    const { event_type, payload } = event.data;
    const { call_control_id, client_state } = payload;
    const state = decodeClientState(client_state);

    fastify.log.info({ event_type, call_control_id }, 'Telnyx webhook received');

    const session = getTeamSession();

    try {
      switch (event_type) {
        case 'call.initiated': {
          updateInFlightCall(call_control_id, { callState: 'ringing' });
          broadcast({
            type: 'call_status_changed',
            data: {
              callState: 'ringing',
              contactId: getInFlightCall(call_control_id)?.contactId,
              callControlId: call_control_id,
            },
          });
          break;
        }

        case 'call.answered': {
          updateInFlightCall(call_control_id, { callState: 'amd_detecting' });
          broadcast({
            type: 'call_status_changed',
            data: {
              callState: 'amd_detecting',
              contactId: getInFlightCall(call_control_id)?.contactId,
              callControlId: call_control_id,
            },
          });

          // Safety timeout — if AMD detection never fires, treat as human
          clearAmdTimeout(call_control_id);
          amdTimeouts.set(
            call_control_id,
            setTimeout(async () => {
              const call = getInFlightCall(call_control_id);
              if (call?.callState === 'amd_detecting') {
                fastify.log.warn({ call_control_id }, 'AMD timeout — no detection result');
                updateInFlightCall(call_control_id, { callState: 'human_answered' });
                broadcast({
                  type: 'call_status_changed',
                  data: {
                    callState: 'human_answered',
                    contactId: call.contactId,
                    callControlId: call_control_id,
                    message: 'AMD timed out — treating as human.',
                  },
                });
                // Auto-route to available operator
                await dialerEngine.routeToOperator(call_control_id);
              }
            }, AMD_TIMEOUT_MS),
          );
          break;
        }

        case 'call.machine.detection.ended': {
          const result = payload.result;
          clearAmdTimeout(call_control_id);

          if (result === 'machine') {
            updateInFlightCall(call_control_id, { callState: 'voicemail_dropping' });
            broadcast({
              type: 'call_status_changed',
              data: {
                callState: 'voicemail_dropping',
                contactId: getInFlightCall(call_control_id)?.contactId,
                callControlId: call_control_id,
              },
            });
          } else {
            // Human or not_sure — route to operator
            const isNotSure = result === 'not_sure';
            if (isNotSure) {
              fastify.log.warn({ call_control_id }, 'AMD returned not_sure — treating as human');
            }

            updateInFlightCall(call_control_id, { callState: 'human_answered' });
            broadcast({
              type: 'call_status_changed',
              data: {
                callState: 'human_answered',
                contactId: getInFlightCall(call_control_id)?.contactId,
                callControlId: call_control_id,
                message: isNotSure
                  ? 'AMD inconclusive — routing to operator.'
                  : 'Human answered — routing to operator.',
              },
            });

            // Play opener first, then auto-route
            try {
              await playOpener(call_control_id, session.campaignId, state);
            } catch (err: any) {
              fastify.log.error({ err, call_control_id }, 'Failed to play opener');
            }

            // Auto-route to available operator
            await dialerEngine.routeToOperator(call_control_id);
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
            try {
              const provider = await getProvider();
              await provider.hangup(call_control_id);
            } catch {
              // Call may have already ended
            }
            await dialerEngine.handleCallEnd(call_control_id, 'voicemail');
          } else if (playbackContext === 'opener') {
            // Opener finished — if not yet bridged, update state
            const call = getInFlightCall(call_control_id);
            if (call && call.callState !== 'operator_bridged') {
              updateInFlightCall(call_control_id, { callState: 'human_answered' });
              broadcast({
                type: 'call_status_changed',
                data: {
                  callState: 'human_answered',
                  contactId: call.contactId,
                  callControlId: call_control_id,
                  message: 'Opener finished — waiting for operator.',
                },
              });
            }
          }
          break;
        }

        case 'call.transcription': {
          const transcriptionData = payload.transcription_data as
            | { transcript: string; confidence: number; is_final: boolean }
            | undefined;

          if (transcriptionData?.is_final && transcriptionData.transcript) {
            const callLog = await db
              .select()
              .from(callLogs)
              .where(eq(callLogs.telnyxCallControlId, call_control_id))
              .get();

            if (callLog) {
              await db.insert(transcripts).values({
                callLogId: callLog.id,
                speaker: 'inbound',
                content: transcriptionData.transcript,
                confidence: transcriptionData.confidence,
              });

              broadcast({
                type: 'transcription',
                data: {
                  callLogId: callLog.id,
                  contactId: getInFlightCall(call_control_id)?.contactId,
                  transcript: transcriptionData.transcript,
                  confidence: transcriptionData.confidence,
                },
              });
            }
          }
          break;
        }

        case 'call.hangup': {
          clearAmdTimeout(call_control_id);
          const call = getInFlightCall(call_control_id);
          if (!call) break;

          let disposition = 'no_answer';
          if (call.callState === 'voicemail_dropping') disposition = 'voicemail';
          else if (call.callState === 'operator_bridged' || call.callState === 'human_answered')
            disposition = 'connected';

          await dialerEngine.handleCallEnd(call_control_id, disposition);
          break;
        }

        case 'call.recording.saved': {
          const recordingUrl = (payload.recording_urls as any)?.mp3 || (payload.public_recording_urls as any)?.mp3;
          if (recordingUrl) {
            await db
              .update(callLogs)
              .set({ recordingUrl })
              .where(eq(callLogs.telnyxCallControlId, call_control_id));
          }
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

    return reply.code(200).send({ received: true });
  });
};

async function playOpener(
  callControlId: string,
  campaignId: number,
  state: Record<string, unknown>,
) {
  const campaign = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign?.openerRecordingId) return;

  // Check if the assigned operator has a profile override
  const call = getInFlightCall(callControlId);
  let recordingId = campaign.openerRecordingId;

  if (call?.assignedOperatorId) {
    const profile = await db
      .select()
      .from(recordings)
      .where(eq(recordings.id, recordingId))
      .get();
    // TODO: check operator's active recording profile for override
  }

  const recording = await db.select().from(recordings).where(eq(recordings.id, recordingId)).get();
  if (!recording) return;

  const provider = await getProvider();
  const webhookBase = config.WEBHOOK_BASE_URL;
  const audioUrl = `${webhookBase}${recording.filePath}`;

  const clientState = JSON.stringify({ ...state, playbackType: 'opener' });
  await provider.playAudio(callControlId, audioUrl, clientState);
}

async function playVoicemail(
  callControlId: string,
  campaignId: number,
  state: Record<string, unknown>,
) {
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
