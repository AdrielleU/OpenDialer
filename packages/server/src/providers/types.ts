export interface DialParams {
  to: string; // E.164 phone number
  from: string; // Caller ID
  connectionId: string;
  webhookUrl: string;
  enableAmd: boolean;
  clientState?: string; // base64 encoded JSON metadata
}

export interface DialResult {
  callControlId: string;
  callLegId: string;
}

export interface TranscriptionOptions {
  language?: string;
  engine?: 'telnyx' | 'google' | 'deepgram' | 'azure';
  tracks?: 'inbound' | 'outbound' | 'both';
}

export interface TelephonyProvider {
  dial(params: DialParams): Promise<DialResult>;
  hangup(callControlId: string): Promise<void>;
  playAudio(callControlId: string, audioUrl: string, clientState?: string): Promise<void>;
  bridge(callControlId: string, targetCallControlId: string): Promise<void>;
  startRecording(callControlId: string): Promise<void>;
  stopRecording(callControlId: string): Promise<void>;
  startTranscription(callControlId: string, options?: TranscriptionOptions): Promise<void>;
  stopTranscription(callControlId: string): Promise<void>;
}
