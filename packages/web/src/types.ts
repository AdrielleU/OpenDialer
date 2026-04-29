export interface Campaign {
  id: number;
  name: string;
  callerId: string;
  openerRecordingId: number | null;
  voicemailRecordingId: number | null;
  failoverRecordingId: number | null;
  enableTranscription?: boolean;
  transcriptionEngine?: string;
  transcriptionMode?: 'off' | 'realtime' | 'post_call';
  dropIfNoOperator?: boolean;
  maxAttempts?: number;
  retryAfterMinutes?: number;
  prioritizeVoicemails?: boolean;
  ivrSequence?: string | null;
  ivrGreetingType?: 'none' | 'recording' | 'tts';
  ivrGreetingTemplate?: string | null;
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
  type: 'opener' | 'voicemail' | 'failover';
  filePath: string;
  durationSeconds: number | null;
  createdAt: string;
}

export interface CallLog {
  id: number;
  campaignId: number;
  contactId: number;
  operatorId: number | null;
  telnyxCallControlId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  talkTimeSeconds: number | null;
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
  | 'waiting_for_operator'
  | 'ended';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'stopped';
export type OperatorAvailability = 'available' | 'on_call' | 'wrap_up' | 'offline';

export interface OperatorStatus {
  userId: number;
  name: string;
  availability: OperatorAvailability;
  bridgedContactId: number | null;
}

export interface InFlightCallStatus {
  callControlId: string;
  contactId: number;
  callState: CallState;
  assignedOperatorId: number | null;
}

export interface DialerStatus {
  status: SessionStatus;
  campaignId: number;
  queueRemaining: number;
  callsMade: number;
  voicemailsDropped: number;
  connects: number;
  sessionStartedAt: string | null;
  operators: OperatorStatus[];
  inFlightCalls: InFlightCallStatus[];
  waitingCalls: number;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'operator';
  mustChangePassword?: boolean;
  mustSetupMfa?: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface RecordingProfile {
  id: number;
  name: string;
  openerRecordingId: number | null;
  voicemailRecordingId: number | null;
  isDefault: boolean;
  createdAt: string;
}

export interface TranscriptLine {
  id: number;
  speaker: 'inbound' | 'outbound';
  content: string;
  confidence: number | null;
  createdAt: string;
}

export interface CallTranscript {
  callLogId: number;
  contactId: number;
  contactName: string | null;
  contactPhone: string;
  disposition: string | null;
  callStartedAt: string | null;
  lines: TranscriptLine[];
}

export interface WsEvent {
  type:
    | 'call_status_changed'
    | 'session_status_changed'
    | 'call_log_added'
    | 'contact_updated'
    | 'transcription'
    | 'call_routed_to_you'
    | 'operator_status_changed'
    | 'call_waiting'
    | 'error';
  data: Record<string, unknown>;
}
