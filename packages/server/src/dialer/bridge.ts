import { getProvider } from '../providers/index.js';
import { getTeamSession, getOperator, setOperatorAvailability } from './team-state.js';
import { broadcast, broadcastToUser } from '../ws/index.js';

// Bridge a specific operator into a specific call
export async function bridgeOperatorIntoCall(
  userId: number,
  callControlId: string,
): Promise<void> {
  const operator = getOperator(userId);
  if (!operator) {
    throw new Error('Operator not found in session.');
  }
  if (!operator.webrtcCallControlId) {
    throw new Error('Operator WebRTC not connected. Connect your softphone first.');
  }

  const provider = await getProvider();
  await provider.bridge(callControlId, operator.webrtcCallControlId);

  setOperatorAvailability(userId, 'on_call');
  operator.bridgedToCallId = callControlId;

  broadcast({
    type: 'call_status_changed',
    data: {
      callState: 'operator_bridged',
      contactId: operator.bridgedContactId,
      operatorId: userId,
      callControlId,
    },
  });

  broadcastToUser(userId, {
    type: 'call_routed_to_you',
    data: {
      callControlId,
      contactId: operator.bridgedContactId,
      operatorId: userId,
    },
  });
}

// Legacy compatibility — for single-operator mode or backward compat
let legacyOperatorCallControlId: string | null = null;

export function setOperatorCallControlId(id: string) {
  legacyOperatorCallControlId = id;
}

export function getOperatorCallControlId(): string | null {
  return legacyOperatorCallControlId;
}
