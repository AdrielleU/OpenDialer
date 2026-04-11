import type { FastifyPluginAsync } from 'fastify';
import { dialerEngine } from '../dialer/engine.js';
import {
  getTeamSession,
  getInFlightCall,
  updateInFlightCall,
  getOperator,
} from '../dialer/team-state.js';
import { getProvider } from '../providers/index.js';
import { broadcast, broadcastToUser } from '../ws/index.js';
import { db } from '../db/index.js';
import { campaigns, contacts, recordings, transcripts, callLogs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { handleOperatorDisconnect, findOperatorByWebrtcLeg } from '../dialer/disconnect.js';
import { transcribeCallRecording } from '../transcription/post-call.js';
import { persistRecording } from '../recordings/storage.js';

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

/**
 * Periodic safety sweep — removes any orphaned timeout entries whose handle
 * has already fired but wasn't cleared (e.g., the callback ran but a code
 * change caused it to skip the delete). Belt-and-suspenders for the AMD
 * timeout map. Called from the same cron interval as transcript cleanup.
 */
export function cleanupOrphanedAmdTimeouts(): number {
  let removed = 0;
  for (const [callControlId, handle] of amdTimeouts.entries()) {
    // Node.js Timer objects expose `_destroyed` after they've fired/cleared.
    // Falling back to a simple has-it-fired check; defensive for type safety.
    const fired = (handle as any)._destroyed === true;
    if (fired) {
      amdTimeouts.delete(callControlId);
      removed++;
    }
  }
  return removed;
}

// Test helper — exposes the map size for verification in unit tests
export function _amdTimeoutMapSize(): number {
  return amdTimeouts.size;
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

  // Loud startup warning for unverified webhook setups. We default to "warn
  // and accept" instead of "fail closed" so first-time / dev installs work
  // out of the box, but production users should set TELNYX_PUBLIC_KEY +
  // WEBHOOK_REQUIRE_SIGNATURE=true.
  if (!config.TELNYX_PUBLIC_KEY) {
    if (config.WEBHOOK_REQUIRE_SIGNATURE) {
      fastify.log.error(
        'WEBHOOK_REQUIRE_SIGNATURE=true but TELNYX_PUBLIC_KEY is not set — all incoming webhooks will be rejected with 403',
      );
    } else {
      fastify.log.warn(
        '⚠ TELNYX_PUBLIC_KEY is not set — webhook signature verification is DISABLED. Anyone who knows your webhook URL can POST fake call events. Set TELNYX_PUBLIC_KEY (and WEBHOOK_REQUIRE_SIGNATURE=true) before going to production.',
      );
    }
  }

  fastify.post('/telnyx', async (request, reply) => {
    const publicKey = config.TELNYX_PUBLIC_KEY;

    // Fail closed when enforcement is requested but no key is configured
    if (config.WEBHOOK_REQUIRE_SIGNATURE && !publicKey) {
      return reply
        .code(403)
        .send({ error: 'Webhook signature verification required but TELNYX_PUBLIC_KEY is not configured' });
    }

    // Verify webhook signature if public key is configured
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
          // Check if this contact has an IVR sequence to navigate
          const answeredCall = getInFlightCall(call_control_id);
          if (answeredCall) {
            const ivrContact = await db
              .select()
              .from(contacts)
              .where(eq(contacts.id, answeredCall.contactId))
              .get();

            // Use contact IVR sequence, fall back to campaign-level
            const ivrSeq = ivrContact?.ivrSequence || session.campaignId
              ? (await db.select().from(campaigns).where(eq(campaigns.id, session.campaignId)).get())?.ivrSequence
              : null;

            if (ivrSeq) {
              // Execute IVR navigation — send DTMF sequence
              broadcast({
                type: 'call_status_changed',
                data: {
                  callState: 'amd_detecting',
                  contactId: answeredCall.contactId,
                  callControlId: call_control_id,
                  message: 'Navigating IVR...',
                },
              });

              try {
                const provider = await getProvider();
                await provider.sendDTMF(call_control_id, ivrSeq);
              } catch (err: any) {
                fastify.log.error({ err, call_control_id }, 'IVR DTMF failed');
              }

              // After IVR nav — bridge operator (muted), play greeting, operator unmutes when ready
              const ivrCampaign = await db
                .select()
                .from(campaigns)
                .where(eq(campaigns.id, session.campaignId))
                .get();

              const hasGreeting =
                (ivrCampaign?.ivrGreetingType === 'tts' && ivrCampaign.ivrGreetingTemplate) ||
                ivrCampaign?.ivrGreetingType === 'recording';

              // Route to operator first — they'll be muted if there's a greeting
              updateInFlightCall(call_control_id, { callState: 'human_answered' });
              const routed = await dialerEngine.routeToOperator(call_control_id);

              if (routed && hasGreeting) {
                const provider = await getProvider();
                const call = getInFlightCall(call_control_id);
                const operator = call?.assignedOperatorId
                  ? getOperator(call.assignedOperatorId)
                  : null;

                // Mute the operator's WebRTC leg so contact only hears the greeting
                if (operator?.webrtcCallControlId) {
                  try {
                    await provider.mute(operator.webrtcCallControlId);
                  } catch {
                    // Mute may not be supported — continue anyway
                  }
                }

                // Play the greeting
                if (ivrCampaign?.ivrGreetingType === 'tts' && ivrCampaign.ivrGreetingTemplate) {
                  let greeting = ivrCampaign.ivrGreetingTemplate;
                  greeting = greeting.replace(/\{\{name\}\}/g, ivrContact?.name || 'there');
                  greeting = greeting.replace(/\{\{company\}\}/g, ivrContact?.company || '');
                  greeting = greeting.replace(/\{\{notes\}\}/g, ivrContact?.notes || '');
                  greeting = greeting.replace(/\{\{phone\}\}/g, ivrContact?.phone || '');

                  try {
                    await provider.speak(call_control_id, greeting);
                  } catch (err: any) {
                    fastify.log.error({ err, call_control_id }, 'IVR TTS greeting failed');
                  }
                } else if (ivrCampaign?.ivrGreetingType === 'recording') {
                  try {
                    await playOpener(call_control_id, session.campaignId, state);
                  } catch (err: any) {
                    fastify.log.error({ err, call_control_id }, 'IVR opener playback failed');
                  }
                }

                // Notify operator they're muted and can stop playback
                if (operator) {
                  broadcastToUser(operator.userId, {
                    type: 'call_status_changed',
                    data: {
                      callState: 'operator_bridged',
                      contactId: answeredCall.contactId,
                      callControlId: call_control_id,
                      message: 'Greeting playing — click "Stop & Talk" when ready.',
                      muted: true,
                    },
                  });
                }
              }
              break;
            }
          }

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
              // Self-clean: always remove this entry from the map when the
              // callback runs, regardless of whether the body below executes.
              // Without this, calls that end abnormally (network drop before
              // call.machine.detection.ended) leak handles forever.
              amdTimeouts.delete(call_control_id);

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

            // Check campaign setting: skip opener if dropIfNoOperator is enabled
            const routeCampaign = await db
              .select()
              .from(campaigns)
              .where(eq(campaigns.id, session.campaignId))
              .get();
            const dropIfNoOp = routeCampaign?.dropIfNoOperator ?? true;

            if (!dropIfNoOp) {
              // Legacy mode: play opener first, then route
              try {
                await playOpener(call_control_id, session.campaignId, state);
              } catch (err: any) {
                fastify.log.error({ err, call_control_id }, 'Failed to play opener');
              }
            }

            // Auto-route to available operator (or drop if none available)
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
          } else if (playbackContext === 'failover') {
            // Operator-disconnect failover finished — hang up the contact leg
            // and log as connected (they did talk to a human, briefly).
            try {
              const provider = await getProvider();
              await provider.hangup(call_control_id);
            } catch {
              // Already gone
            }
            await dialerEngine.handleCallEnd(call_control_id, 'connected');
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
                  speaker: 'inbound',
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

          if (!call) {
            // Not a contact leg — could be an operator's WebRTC leg dropping
            // (browser crash, network glitch, sleep, intentional close).
            const orphanedOperator = findOperatorByWebrtcLeg(call_control_id);
            if (orphanedOperator) {
              fastify.log.warn(
                { operatorId: orphanedOperator.userId },
                'Operator WebRTC leg disconnected — running failover cleanup',
              );
              await handleOperatorDisconnect(orphanedOperator);
            }
            break;
          }

          // Map the in-flight call state at hangup time to a disposition.
          // The richer "ringing_abandoned" / "amd_abandoned" values let
          // analytics distinguish "contact never picked up" from "contact
          // hung up while we were still figuring out who they were".
          let disposition = 'no_answer';
          switch (call.callState) {
            case 'voicemail_dropping':
              disposition = 'voicemail';
              break;
            case 'operator_bridged':
            case 'human_answered':
            case 'opener_playing':
              disposition = 'connected';
              break;
            case 'dialing':
            case 'ringing':
              disposition = 'ringing_abandoned';
              break;
            case 'amd_detecting':
              disposition = 'amd_abandoned';
              break;
            default:
              disposition = 'no_answer';
          }

          await dialerEngine.handleCallEnd(call_control_id, disposition);
          break;
        }

        case 'call.recording.saved': {
          const remoteRecordingUrl =
            (payload.recording_urls as any)?.mp3 ||
            (payload.public_recording_urls as any)?.mp3;
          if (!remoteRecordingUrl) break;

          // Look up the call log + campaign once; we need both for the
          // transcription decision.
          const callLog = await db
            .select()
            .from(callLogs)
            .where(eq(callLogs.telnyxCallControlId, call_control_id))
            .get();
          if (!callLog) break;

          // Optionally download the recording into local storage. Falls back
          // to the remote URL on any failure, so the call log always has
          // something pointing at the audio.
          const recordingUrl = await persistRecording(remoteRecordingUrl, callLog.id);

          await db
            .update(callLogs)
            .set({ recordingUrl })
            .where(eq(callLogs.id, callLog.id));

          // Post-call transcription: if the campaign requested it, fire a
          // background job to download → STT → store. Fire-and-forget so the
          // webhook response is fast and the dialer keeps running.
          const campaign = await db
            .select()
            .from(campaigns)
            .where(eq(campaigns.id, callLog.campaignId))
            .get();

          if (campaign?.transcriptionMode === 'post_call') {
            transcribeCallRecording(callLog.id, recordingUrl).catch((err) =>
              console.error('[transcription] post-call failed:', err?.message ?? err),
            );
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
