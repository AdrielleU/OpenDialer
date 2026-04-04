export interface Campaign {
  id: number;
  name: string;
  callerId: string;
  openerRecordingId: number | null;
  voicemailRecordingId: number | null;
  status: 'draft' | 'active' | 'paused' | 'completed';
  createdAt: string;
  updatedAt: string;
  contactCount?: number;
}

export interface Contact {
  id: number;
  campaignId: number;
  name: string | null;
  phone: string;
  company: string | null;
  email: string | null;
  notes: string | null;
  status: 'pending' | 'voicemail' | 'connected' | 'no_answer' | 'callback' | 'not_interested' | 'dnc';
  callCount: number;
  lastCalledAt: string | null;
  createdAt: string;
}

export interface Recording {
  id: number;
  name: string;
  type: 'opener' | 'voicemail';
  filePath: string;
  durationSeconds: number | null;
  createdAt: string;
}

export interface CallLog {
  id: number;
  campaignId: number;
  contactId: number;
  telnyxCallControlId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  disposition: 'voicemail' | 'connected' | 'no_answer' | 'busy' | 'failed' | null;
  recordingUrl: string | null;
  humanTookOver: boolean;
  notes: string | null;
}

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

export interface DialerStatus {
  status: SessionStatus;
  campaignId: number;
  currentContactId: number | null;
  currentCallState: CallState;
  queueRemaining: number;
  callsMade: number;
  voicemailsDropped: number;
  connects: number;
  sessionStartedAt: string | null;
}

export interface WsEvent {
  type: 'call_status_changed' | 'session_status_changed' | 'call_log_added' | 'contact_updated' | 'error';
  data: Record<string, unknown>;
}
