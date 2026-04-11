import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Transcription from '../pages/Transcription';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    campaigns: {
      list: vi.fn(),
      update: vi.fn(),
    },
    transcripts: {
      byCampaign: vi.fn(),
      retranscribe: vi.fn(),
    },
    settings: {
      get: vi.fn(),
    },
  },
}));

const mockApi = api as unknown as {
  campaigns: {
    list: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  transcripts: {
    byCampaign: ReturnType<typeof vi.fn>;
    retranscribe: ReturnType<typeof vi.fn>;
  };
  settings: {
    get: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.campaigns.list.mockResolvedValue([
    {
      id: 1,
      name: 'Insurance Follow-Up',
      callerId: '+15551112222',
      openerRecordingId: null,
      voicemailRecordingId: null,
      failoverRecordingId: null,
      enableTranscription: false,
      transcriptionMode: 'off',
      status: 'draft',
      createdAt: '2026-04-01',
      updatedAt: '2026-04-01',
    },
  ]);
  mockApi.campaigns.update.mockResolvedValue({});
  mockApi.transcripts.byCampaign.mockResolvedValue([]);
  mockApi.settings.get.mockResolvedValue({});
  mockApi.transcripts.retranscribe.mockResolvedValue({ status: 'transcribed', lines: 3 });
});

describe('Transcription page', () => {
  it('renders the campaign list', async () => {
    render(<Transcription />);
    await waitFor(() => {
      // Campaign appears in both the list and the dropdown — use getAllByText
      expect(screen.getAllByText('Insurance Follow-Up').length).toBeGreaterThan(0);
    });
  });

  it('opens the config modal with all 3 mode options', async () => {
    render(<Transcription />);
    await waitFor(() => screen.getByText('Configure'));

    fireEvent.click(screen.getByText('Configure'));
    await waitFor(() => screen.getByText('Transcription Mode'));

    // "Off" / "Live (real-time)" / "After call (batch)" each appear in
    // both the campaign list status hint and the modal radio labels —
    // assert >= 1 match for each rather than exactly 1.
    expect(screen.getAllByText('Off').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Live (real-time)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('After call (batch)').length).toBeGreaterThan(0);
  });

  it('disables post-call mode when neither STT provider is configured', async () => {
    mockApi.settings.get.mockResolvedValueOnce({}); // no OPENAI_API_KEY, no WHISPER_BATCH_URL
    render(<Transcription />);
    await waitFor(() => screen.getByText('Configure'));
    fireEvent.click(screen.getByText('Configure'));
    await waitFor(() => screen.getByText('After call (batch)'));

    // The radio for post_call should be disabled and the helper text shown
    expect(screen.getByText(/Set OPENAI_API_KEY or WHISPER_BATCH_URL/)).toBeInTheDocument();
  });

  it('enables post-call mode when WHISPER_BATCH_URL is configured', async () => {
    mockApi.settings.get.mockResolvedValueOnce({ WHISPER_BATCH_URL: 'http://whisper:9000/asr' });
    render(<Transcription />);
    await waitFor(() => screen.getByText('Configure'));
    fireEvent.click(screen.getByText('Configure'));
    await waitFor(() => screen.getByText('After call (batch)'));

    // The disabled hint should NOT be shown
    expect(screen.queryByText(/Set OPENAI_API_KEY or WHISPER_BATCH_URL/)).not.toBeInTheDocument();
  });

  it('shows HIPAA warning when only OpenAI is configured (cloud, no BAA)', async () => {
    mockApi.settings.get.mockResolvedValueOnce({ OPENAI_API_KEY: 'sk-test' });
    render(<Transcription />);
    await waitFor(() => screen.getByText('Configure'));
    fireEvent.click(screen.getByText('Configure'));
    await waitFor(() => screen.getByText('After call (batch)'));

    // Pick the post_call option to expose the warning
    const postCallRadio = screen.getByText('After call (batch)').closest('label')!.querySelector('input')!;
    fireEvent.click(postCallRadio);

    await waitFor(() => {
      expect(screen.getByText(/OpenAI standard API does not sign HIPAA BAAs/)).toBeInTheDocument();
    });
  });

  it('renders transcripts for the selected campaign', async () => {
    mockApi.transcripts.byCampaign.mockResolvedValueOnce([
      {
        callLogId: 100,
        contactId: 1,
        contactName: 'Sarah Smith',
        contactPhone: '+15559876543',
        disposition: 'connected',
        callStartedAt: '2026-04-10T10:00:00Z',
        lines: [
          { id: 1, speaker: 'inbound', content: 'Hello from the test transcript', confidence: 0.95, createdAt: '2026-04-10T10:00:01Z' },
        ],
      },
    ]);
    render(<Transcription />);
    await waitFor(() => screen.getByText('Configure'));

    // Select the campaign in the transcript history dropdown
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '1' } });

    await waitFor(() => {
      expect(screen.getByText('Sarah Smith')).toBeInTheDocument();
    });
  });
});
