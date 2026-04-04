import type { TelephonyProvider, DialParams, DialResult } from './types.js';

export class TwilioProvider implements TelephonyProvider {
  async dial(_params: DialParams): Promise<DialResult> {
    throw new Error('Twilio provider not yet implemented');
  }

  async hangup(_callControlId: string): Promise<void> {
    throw new Error('Twilio provider not yet implemented');
  }

  async playAudio(_callControlId: string, _audioUrl: string): Promise<void> {
    throw new Error('Twilio provider not yet implemented');
  }

  async bridge(_callControlId: string, _targetCallControlId: string): Promise<void> {
    throw new Error('Twilio provider not yet implemented');
  }

  async startRecording(_callControlId: string): Promise<void> {
    throw new Error('Twilio provider not yet implemented');
  }

  async stopRecording(_callControlId: string): Promise<void> {
    throw new Error('Twilio provider not yet implemented');
  }

  async startTranscription(_callControlId: string): Promise<void> {
    throw new Error('Twilio provider not yet implemented');
  }

  async stopTranscription(_callControlId: string): Promise<void> {
    throw new Error('Twilio provider not yet implemented');
  }

  async startStreaming(_callControlId: string, _streamUrl: string): Promise<void> {
    throw new Error('Twilio provider not yet implemented');
  }

  async stopStreaming(_callControlId: string): Promise<void> {
    throw new Error('Twilio provider not yet implemented');
  }
}
