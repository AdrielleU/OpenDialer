import { useEffect, useState } from 'react';
import { Play, Volume2, MessageSquareText } from 'lucide-react';
import { api } from '../lib/api';
import type { Recording } from '../types';

interface Props {
  callControlId: string;
  contactName: string | null;
}

/**
 * Soundboard — operator's in-call playback controls.
 *
 * Two ways to put audio onto the live call:
 *   1. Click any pre-recorded clip → server tells Telnyx to play it.
 *   2. Type a message and click Speak → Telnyx TTS speaks it.
 *
 * The TTS box is pre-filled with a greeting using the contact's name (the
 * operator can rewrite it before speaking).
 */
export default function Soundboard({ callControlId, contactName }: Props) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load all recordings once when the component mounts.
  useEffect(() => {
    api.recordings
      .list()
      .then(setRecordings)
      .catch((err) => setError(err.message));
  }, []);

  // Reset the TTS text whenever the contact changes — default is a greeting
  // built from the contact's name. Operator can edit before sending.
  useEffect(() => {
    setText(contactName ? `Hi ${contactName}, ` : '');
  }, [contactName]);

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

  const handleSpeak = async () => {
    if (!text.trim()) return;
    setError(null);
    setBusy('speak');
    try {
      await api.dialer.speak(callControlId, text.trim());
    } catch (err: any) {
      setError(`Could not speak: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto mt-4 space-y-4">
      {/* TTS message box */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          <MessageSquareText size={14} />
          AI Voice Message
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Type something to speak to the contact..."
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500 resize-none"
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-gray-500">
            Default uses contact name. Edit freely before speaking.
          </span>
          <button
            onClick={handleSpeak}
            disabled={!text.trim() || busy === 'speak'}
            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <Volume2 size={14} />
            {busy === 'speak' ? 'Speaking...' : 'Speak'}
          </button>
        </div>
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
