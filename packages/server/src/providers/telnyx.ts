import Telnyx from 'telnyx';
import type {
  TelephonyProvider,
  TelephonyCredential,
  DialParams,
  DialResult,
  TranscriptionOptions,
} from './types.js';

export class TelnyxProvider implements TelephonyProvider {
  private client: any;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = new (Telnyx as any)(apiKey);
  }

  async dial(params: DialParams): Promise<DialResult> {
    const response = await this.client.calls.dial({
      connection_id: params.connectionId,
      to: params.to,
      from: params.from,
      webhook_url: params.webhookUrl,
      answering_machine_detection: params.enableAmd ? 'detect_beep' : 'disabled',
      client_state: params.clientState
        ? Buffer.from(params.clientState).toString('base64')
        : undefined,
    });

    return {
      callControlId: response.data.call_control_id,
      callLegId: response.data.call_leg_id,
    };
  }

  async hangup(callControlId: string): Promise<void> {
    await this.client.calls.actions.hangup(callControlId);
  }

  async playAudio(callControlId: string, audioUrl: string, clientState?: string): Promise<void> {
    await this.client.calls.actions.startPlayback(callControlId, {
      audio_url: audioUrl,
      client_state: clientState
        ? Buffer.from(clientState).toString('base64')
        : undefined,
    });
  }

  async bridge(callControlId: string, targetCallControlId: string): Promise<void> {
    await this.client.calls.actions.bridge(callControlId, {
      call_control_id: targetCallControlId,
    });
  }

  async startRecording(callControlId: string): Promise<void> {
    await this.client.calls.actions.startRecording(callControlId, {
      format: 'mp3',
      channels: 'dual',
    });
  }

  async stopRecording(callControlId: string): Promise<void> {
    await this.client.calls.actions.stopRecording(callControlId);
  }

  async startTranscription(callControlId: string, options: TranscriptionOptions = {}): Promise<void> {
    await this.client.calls.actions.transcriptionStart(callControlId, {
      language: options.language || 'en',
      transcription_engine: 'B',
      transcription_tracks: options.tracks || 'both',
    });
  }

  async stopTranscription(callControlId: string): Promise<void> {
    await this.client.calls.actions.transcriptionStop(callControlId);
  }

  async mute(callControlId: string): Promise<void> {
    await this.client.calls.actions.mute(callControlId);
  }

  async unmute(callControlId: string): Promise<void> {
    await this.client.calls.actions.unmute(callControlId);
  }

  async stopPlayback(callControlId: string): Promise<void> {
    await this.client.calls.actions.stopPlayback(callControlId);
  }

  async sendDTMF(callControlId: string, digits: string): Promise<void> {
    await this.client.calls.actions.sendDTMF(callControlId, {
      digits,
    });
  }

  async speak(callControlId: string, text: string, voice = 'female'): Promise<void> {
    await this.client.calls.actions.speak(callControlId, {
      payload: text,
      voice,
      language: 'en-US',
    });
  }

  async provisionCredential(connectionId: string, name: string): Promise<TelephonyCredential> {
    const res = await fetch('https://api.telnyx.com/v2/telephony_credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ connection_id: connectionId, name }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Telnyx credential provisioning failed: ${res.status} ${err}`);
    }

    const { data } = await res.json();
    return {
      id: data.id,
      sipUsername: data.sip_username,
      sipPassword: data.sip_password,
    };
  }

  async deleteCredential(credentialId: string): Promise<void> {
    const res = await fetch(`https://api.telnyx.com/v2/telephony_credentials/${credentialId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Telnyx credential deletion failed: ${res.status}`);
    }
  }
}
