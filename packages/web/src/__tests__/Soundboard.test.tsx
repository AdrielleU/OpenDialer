import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Soundboard from '../components/Soundboard';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    recordings: {
      list: vi.fn(),
    },
    dialer: {
      playRecording: vi.fn(),
      dropVoicemail: vi.fn(),
    },
  },
}));

const mockApi = api as unknown as {
  recordings: { list: ReturnType<typeof vi.fn> };
  dialer: {
    playRecording: ReturnType<typeof vi.fn>;
    dropVoicemail: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.recordings.list.mockResolvedValue([
    { id: 1, name: 'Opener Clip', type: 'opener', filePath: '/uploads/op.mp3', durationSeconds: 5, createdAt: '2026-04-01' },
    { id: 2, name: 'Voicemail Drop', type: 'voicemail', filePath: '/uploads/vm.mp3', durationSeconds: 12, createdAt: '2026-04-01' },
  ]);
  mockApi.dialer.playRecording.mockResolvedValue({ status: 'playing' });
  mockApi.dialer.dropVoicemail.mockResolvedValue({ status: 'dropping', recordingId: 2 });
});

describe('Soundboard component', () => {
  it('loads recordings on mount and renders them as buttons', async () => {
    render(<Soundboard callControlId="call-1" contactName="Bob" />);
    await waitFor(() => {
      expect(screen.getByText('Opener Clip')).toBeInTheDocument();
      expect(screen.getByText('Voicemail Drop')).toBeInTheDocument();
    });
    expect(mockApi.recordings.list).toHaveBeenCalledTimes(1);
  });

  it('clicking a recording button calls api.dialer.playRecording with the right args', async () => {
    render(<Soundboard callControlId="call-xyz" contactName="Bob" />);
    await waitFor(() => screen.getByText('Opener Clip'));
    fireEvent.click(screen.getByText('Opener Clip'));
    await waitFor(() => {
      expect(mockApi.dialer.playRecording).toHaveBeenCalledWith('call-xyz', 1);
    });
  });

  it('shows an error message when playRecording fails', async () => {
    mockApi.dialer.playRecording.mockRejectedValueOnce(new Error('call ended'));
    render(<Soundboard callControlId="call-1" contactName="Eve" />);
    await waitFor(() => screen.getByText('Opener Clip'));

    fireEvent.click(screen.getByText('Opener Clip'));
    await waitFor(() => {
      expect(screen.getByText(/Could not play Opener Clip: call ended/)).toBeInTheDocument();
    });
  });

  it('shows the empty state when no recordings are uploaded', async () => {
    mockApi.recordings.list.mockResolvedValueOnce([]);
    render(<Soundboard callControlId="call-1" contactName="Fred" />);
    await waitFor(() => {
      expect(screen.getByText(/No recordings uploaded yet/)).toBeInTheDocument();
    });
  });

  it('clicking Drop Campaign Voicemail calls api.dialer.dropVoicemail', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Soundboard callControlId="call-vm" contactName="Bob" />);
    await waitFor(() => screen.getByText('Drop Campaign Voicemail'));

    fireEvent.click(screen.getByText('Drop Campaign Voicemail'));
    await waitFor(() => {
      expect(mockApi.dialer.dropVoicemail).toHaveBeenCalledWith('call-vm', undefined);
    });
  });
});
