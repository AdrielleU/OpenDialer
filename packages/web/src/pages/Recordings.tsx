import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import type { Recording } from '../types';
import { Upload, Trash2, Play, Pause } from 'lucide-react';

export default function Recordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    name: '',
    type: 'opener' as 'opener' | 'voicemail' | 'failover',
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = () => { api.recordings.list().then(setRecordings).catch(console.error); };
  useEffect(load, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      await api.recordings.upload(file, uploadForm.name || file.name, uploadForm.type);
      setShowUpload(false);
      setFile(null);
      setUploadForm({ name: '', type: uploadForm.type });
      load();
    } catch (err: any) {
      alert(err.message);
    }
    setUploading(false);
  };

  const togglePlay = (recording: Recording) => {
    if (playingId === recording.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(recording.filePath);
      audio.onended = () => setPlayingId(null);
      audio.play();
      audioRef.current = audio;
      setPlayingId(recording.id);
    }
  };

  const openers = recordings.filter((r) => r.type === 'opener');
  const voicemails = recordings.filter((r) => r.type === 'voicemail');
  const failovers = recordings.filter((r) => r.type === 'failover');

  const RecordingSection = ({ title, items }: { title: string; items: Recording[] }) => (
    <div className="mb-8">
      <h2 className="text-lg font-semibold mb-3 text-gray-300">{title}</h2>
      <div className="space-y-2">
        {items.map((r) => (
          <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => togglePlay(r)} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                {playingId === r.id ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <div>
                <div className="font-medium text-sm">{r.name}</div>
                <div className="text-xs text-gray-500">
                  {r.durationSeconds ? `${r.durationSeconds}s` : 'Unknown duration'} &middot; {new Date(r.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
            <button
              onClick={async () => { if (confirm('Delete this recording?')) { await api.recordings.delete(r.id); load(); } }}
              className="p-2 text-gray-500 hover:text-red-400 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-sm text-gray-600 py-4 text-center">No {title.toLowerCase()} uploaded yet.</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Recordings</h1>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors"
        >
          <Upload size={16} /> Upload Recording
        </button>
      </div>

      <RecordingSection title="Opener Recordings" items={openers} />
      <RecordingSection title="Voicemail Drops" items={voicemails} />
      <RecordingSection title="Failover Recordings" items={failovers} />

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form onSubmit={handleUpload} className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Upload Recording</h2>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Recording Name</label>
              <input
                value={uploadForm.name}
                onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g., Sarah Opener v2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Type</label>
              <div className="flex gap-4">
                {(['opener', 'voicemail', 'failover'] as const).map((t) => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={uploadForm.type === t}
                      onChange={() => setUploadForm({ ...uploadForm, type: t })}
                      className="accent-emerald-500"
                    />
                    <span className="text-sm capitalize">{t}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Audio File</label>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
                className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-800 file:text-gray-300 hover:file:bg-gray-700"
              />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={!file || uploading} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
              <button type="button" onClick={() => setShowUpload(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
