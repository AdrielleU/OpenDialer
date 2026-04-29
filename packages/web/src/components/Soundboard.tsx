import { useEffect, useState } from 'react';
import { Play, Voicemail } from 'lucide-react';
import { api } from '../lib/api';
import type { Recording } from '../types';

interface Props {
  callControlId: string;
  contactName: string | null;
}

/**
 * Soundboard — operator's in-call playback controls.
 *
 * - Click any pre-recorded clip → server tells Telnyx to play it on the call.
 * - "Drop Voicemail" plays the campaign voicemail and hangs up the call.
 */
export default function Soundboard({ callControlId }: Props) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.recordings
      .list()
      .then(setRecordings)
      .catch((err) => setError(err.message));
  }, []);

  const handlePlay = async (recordingId: number, recordingName: string) => {
    setError(null);
    setBusy(`rec-${recordingId}`);
    try {
      await api.dialer.playRecording(callControlId, recordingId);
    } catch (err: any) {
      setError(`Could not play ${recordingName}: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleDropVoicemail = async (recordingId?: number) => {
    if (!confirm('Drop voicemail and end this call?')) return;
    setError(null);
    setBusy('drop-vm');
    try {
      await api.dialer.dropVoicemail(callControlId, recordingId);
    } catch (err: any) {
      setError(`Could not drop voicemail: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  const voicemailRecordings = recordings.filter((r) => r.type === 'voicemail');

  return (
    <div className="w-full max-w-lg mx-auto mt-4 space-y-4">
      {/* Drop voicemail — ends the call after the recording finishes */}
      <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-yellow-300 uppercase tracking-wider">
          <Voicemail size={14} />
          Drop Voicemail
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Plays a voicemail message on this call and hangs up automatically when it finishes.
          You'll be freed for the next call instantly — no need to wait through the recording.
        </p>
        {voicemailRecordings.length === 0 ? (
          <button
            onClick={() => handleDropVoicemail()}
            disabled={busy === 'drop-vm'}
            className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2"
          >
            <Voicemail size={14} />
            {busy === 'drop-vm' ? 'Dropping...' : 'Drop Campaign Voicemail'}
          </button>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={() => handleDropVoicemail()}
              disabled={busy === 'drop-vm'}
              className="px-3 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              <Voicemail size={14} />
              {busy === 'drop-vm' ? 'Dropping...' : 'Drop Campaign Voicemail'}
            </button>
            {voicemailRecordings.map((rec) => (
              <button
                key={rec.id}
                onClick={() => handleDropVoicemail(rec.id)}
                disabled={busy === 'drop-vm'}
                className="px-3 py-1.5 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 border border-yellow-500/30 rounded-lg text-xs text-left text-gray-200 transition-colors flex items-center gap-2"
                title={`Drop "${rec.name}" instead of campaign default`}
              >
                <Voicemail size={12} className="shrink-0 text-yellow-400" />
                <span className="truncate">Use: {rec.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recording soundboard */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          <Play size={14} />
          Soundboard
        </div>
        {recordings.length === 0 ? (
          <p className="text-xs text-gray-600">
            No recordings uploaded yet. Add some on the Recordings page.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {recordings.map((rec) => (
              <button
                key={rec.id}
                onClick={() => handlePlay(rec.id, rec.name)}
                disabled={busy === `rec-${rec.id}`}
                className="px-3 py-2 bg-gray-900 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-600 border border-gray-700 rounded-lg text-xs text-left text-gray-200 transition-colors flex items-center gap-2 truncate"
                title={rec.name}
              >
                <Play size={12} className="shrink-0 text-emerald-400" />
                <span className="truncate">{rec.name}</span>
                <span className="ml-auto text-[10px] uppercase text-gray-600 shrink-0">
                  {rec.type}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
