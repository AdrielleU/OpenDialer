import { getProvider } from '../providers/index.js';
import { getSession, updateSession } from './state.js';
import { broadcast } from '../ws/index.js';
import { db } from '../db/index.js';
import { campaigns } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Store the operator's WebRTC call control ID when they connect
let operatorCallControlId: string | null = null;

export function setOperatorCallControlId(id: string) {
  operatorCallControlId = id;
}

export function getOperatorCallControlId(): string | null {
  return operatorCallControlId;
}

export async function bridgeOperatorIntoCall(): Promise<void> {
  const session = getSession();

  if (!session.currentCallControlId) {
    throw new Error('No active call to bridge into');
  }

  if (!operatorCallControlId) {
    throw new Error('Operator WebRTC not connected. Connect your softphone first.');
  }

  const provider = await getProvider();
  await provider.bridge(session.currentCallControlId, operatorCallControlId);

  updateSession({ currentCallState: 'operator_bridged' });

  broadcast({
    type: 'call_status_changed',
    data: {
      callState: 'operator_bridged',
      contactId: session.currentContactId,
    },
  });

  // Start transcription if enabled for this campaign
  try {
    const campaign = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, session.campaignId))
      .get();

    if (campaign?.enableTranscription) {
      const engineMap: Record<string, 'telnyx' | 'google' | 'deepgram' | 'azure'> = {
        telnyx: 'telnyx',
        google: 'google',
        deepgram: 'deepgram',
        azure: 'azure',
      };
      await provider.startTranscription(session.currentCallControlId, {
        engine: engineMap[campaign.transcriptionEngine || 'telnyx'] || 'telnyx',
        tracks: 'both',
      });
    }
  } catch {
    // Don't fail the bridge if transcription fails to start
    broadcast({
      type: 'error',
      data: { message: 'Failed to start transcription — call is still connected' },
    });
  }
}
