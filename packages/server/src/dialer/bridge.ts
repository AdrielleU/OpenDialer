import { getProvider } from '../providers/index.js';
import { getSession, updateSession } from './state.js';
import { broadcast } from '../ws/index.js';

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
}
