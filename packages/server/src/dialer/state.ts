export type CallState =
  | 'idle'
  | 'dialing'
  | 'ringing'
  | 'amd_detecting'
  | 'voicemail_dropping'
  | 'human_answered'
  | 'opener_playing'
  | 'operator_bridged'
  | 'ended';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'stopped';

export interface DialerSession {
  campaignId: number;
  status: SessionStatus;
  queue: number[]; // contact IDs remaining
  currentContactId: number | null;
  currentCallControlId: string | null;
  currentCallState: CallState;
  callsMade: number;
  voicemailsDropped: number;
  connects: number;
  sessionStartedAt: string | null;
}

const defaultSession: DialerSession = {
  campaignId: 0,
  status: 'idle',
  queue: [],
  currentContactId: null,
  currentCallControlId: null,
  currentCallState: 'idle',
  callsMade: 0,
  voicemailsDropped: 0,
  connects: 0,
  sessionStartedAt: null,
};

let session: DialerSession = { ...defaultSession };

export function getSession(): DialerSession {
  return session;
}

export function updateSession(updates: Partial<DialerSession>): DialerSession {
  session = { ...session, ...updates };
  return session;
}

export function resetSession(): DialerSession {
  session = { ...defaultSession };
  return session;
}
