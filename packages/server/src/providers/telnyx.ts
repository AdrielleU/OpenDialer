import Telnyx from 'telnyx';
import type { TelephonyProvider, DialParams, DialResult } from './types.js';

export class TelnyxProvider implements TelephonyProvider {
  private client: any;

  constructor(apiKey: string) {
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
}
