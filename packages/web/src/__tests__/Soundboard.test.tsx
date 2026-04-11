import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Soundboard from '../components/Soundboard';
import { api } from '../lib/api';

// Mock the API client at the module level
vi.mock('../lib/api', () => ({
  api: {
    recordings: {
      list: vi.fn(),
    },
    dialer: {
      playRecording: vi.fn(),
      speak: vi.fn(),
    },
  },
}));

const mockApi = api as unknown as {
  recordings: { list: ReturnType<typeof vi.fn> };
  dialer: {
    playRecording: ReturnType<typeof vi.fn>;
    speak: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.recordings.list.mockResolvedValue([
    { id: 1, name: 'Opener Clip', type: 'opener', filePath: '/uploads/op.mp3', durationSeconds: 5, createdAt: '2026-04-01' },
    { id: 2, name: 'Voicemail Drop', type: 'voicemail', filePath: '/uploads/vm.mp3', durationSeconds: 12, createdAt: '2026-04-01' },
  ]);
  mockApi.dialer.playRecording.mockResolvedValue({ status: 'playing' });
  mockApi.dialer.speak.mockResolvedValue({ status: 'speaking' });
});

describe('Soundboard component', () => {
  it('pre-fills the TTS text box with the contact name greeting', async () => {
    render(<Soundboard callControlId="call-1" contactName="Alice" />);
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/Type something/) as HTMLTextAreaElement;
      expect(textarea.value).toBe('Hi Alice, ');
    });
  });

  it('renders an empty TTS text box when contact name is null', async () => {
    render(<Soundboard callControlId="call-1" contactName={null} />);
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/Type something/) as HTMLTextAreaElement;
      expect(textarea.value).toBe('');
    });
  });

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

  it('Speak button is disabled when text is empty', async () => {
    render(<Soundboard callControlId="call-1" contactName={null} />);
    await waitFor(() => screen.getByText('Speak'));
    const speakBtn = screen.getByText('Speak').closest('button')!;
    expect(speakBtn).toBeDisabled();
  });

  it('clicking Speak calls api.dialer.speak with trimmed text', async () => {
    render(<Soundboard callControlId="call-1" contactName="Carol" />);
    await waitFor(() => screen.getByText('Speak'));

    const textarea = screen.getByPlaceholderText(/Type something/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '  Hello there  ' } });

    fireEvent.click(screen.getByText('Speak'));
    await waitFor(() => {
      expect(mockApi.dialer.speak).toHaveBeenCalledWith('call-1', 'Hello there');
    });
  });

  it('shows an error message when speak fails', async () => {
    mockApi.dialer.speak.mockRejectedValueOnce(new Error('Telnyx unavailable'));
    render(<Soundboard callControlId="call-1" contactName="Dan" />);
    await waitFor(() => screen.getByText('Speak'));

    fireEvent.click(screen.getByText('Speak'));
    await waitFor(() => {
      expect(screen.getByText(/Could not speak: Telnyx unavailable/)).toBeInTheDocument();
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
});
