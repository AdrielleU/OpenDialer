import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Campaign, CallTranscript } from '../types';
import {
  MessageSquareText,
  ChevronDown,
  ChevronRight,
  Mic,
  User,
  RefreshCw,
} from 'lucide-react';

type TranscriptionMode = 'off' | 'realtime' | 'post_call';

const modeLabels: Record<TranscriptionMode, { name: string; cost: string; description: string }> = {
  off: {
    name: 'Off',
    cost: '$0',
    description: 'No transcription. Recordings are still saved.',
  },
  realtime: {
    name: 'Live (real-time)',
    cost: '~$0.025/min',
    description: 'See transcripts during the call via Telnyx built-in transcription.',
  },
  post_call: {
    name: 'After call (batch)',
    cost: '~$0.006/min cloud, $0 self-hosted',
    description: 'Transcribe the recording after hangup — much cheaper, slight delay.',
  },
};

export default function Transcription() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [transcripts, setTranscripts] = useState<CallTranscript[]>([]);
  const [expandedCall, setExpandedCall] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [configCampaignId, setConfigCampaignId] = useState<number | null>(null);
  const [configForm, setConfigForm] = useState({
    transcriptionMode: 'off' as TranscriptionMode,
  });
  const [serverSettings, setServerSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [retranscribingId, setRetranscribingId] = useState<number | null>(null);

  const refetchTranscripts = () => {
    if (selectedCampaignId) {
      api.transcripts.byCampaign(selectedCampaignId).then(setTranscripts).catch(console.error);
    }
  };

  const handleRetranscribe = async (callLogId: number) => {
    if (!confirm('Re-transcribe this call? Existing transcript lines will be replaced.')) return;
    setRetranscribingId(callLogId);
    try {
      await api.transcripts.retranscribe(callLogId, true);
      refetchTranscripts();
    } catch (err: any) {
      alert(`Re-transcribe failed: ${err.message}`);
    }
    setRetranscribingId(null);
  };

  useEffect(() => {
    api.campaigns.list().then(setCampaigns).catch(console.error);
    api.settings.get().then(setServerSettings).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCampaignId) {
      setLoading(true);
      api.transcripts
        .byCampaign(selectedCampaignId)
        .then(setTranscripts)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [selectedCampaignId]);

  const openConfig = (campaign: Campaign) => {
    setConfigCampaignId(campaign.id);
    const legacyMode: TranscriptionMode = (campaign as any).transcriptionMode
      ? (campaign as any).transcriptionMode
      : (campaign as any).enableTranscription
        ? 'realtime'
        : 'off';
    setConfigForm({ transcriptionMode: legacyMode });
  };

  const saveConfig = async () => {
    if (!configCampaignId) return;
    setSaving(true);
    try {
      await api.campaigns.update(configCampaignId, {
        transcriptionMode: configForm.transcriptionMode,
        enableTranscription: configForm.transcriptionMode === 'realtime',
      } as any);
      setCampaigns((prev) =>
        prev.map((c) => (c.id === configCampaignId ? { ...c, ...configForm } : c)),
      );
      setConfigCampaignId(null);
    } catch (err: any) {
      alert(err.message);
    }
    setSaving(false);
  };

  const hasOpenAIKey = !!serverSettings.OPENAI_API_KEY;
  const hasWhisperUrl = !!serverSettings.WHISPER_BATCH_URL;
  const postCallReady = hasOpenAIKey || hasWhisperUrl;

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <MessageSquareText size={24} className="text-emerald-400" />
        <h1 className="text-2xl font-bold">Transcription</h1>
      </div>

      {/* Campaign transcription config */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3 text-gray-300">Campaign Settings</h2>
        <div className="space-y-2">
          {campaigns.map((campaign) => {
            const mode: TranscriptionMode =
              (campaign as any).transcriptionMode ??
              ((campaign as any).enableTranscription ? 'realtime' : 'off');
            const dotColor =
              mode === 'off'
                ? 'bg-gray-600'
                : mode === 'realtime'
                  ? 'bg-emerald-500'
                  : 'bg-blue-500';
            return (
              <div
                key={campaign.id}
                className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                  <div>
                    <div className="font-medium text-sm">{campaign.name}</div>
                    <div className="text-xs text-gray-500">
                      {modeLabels[mode].name}
                      <span className="ml-2 text-gray-600">{modeLabels[mode].cost}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => openConfig(campaign)}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs transition-colors"
                >
                  Configure
                </button>
              </div>
            );
          })}
          {campaigns.length === 0 && (
            <div className="text-sm text-gray-600 py-4 text-center">
              No campaigns yet. Create one in the Campaigns page.
            </div>
          )}
        </div>
      </div>

      {/* Transcript viewer */}
      <div>
        <h2 className="text-lg font-semibold mb-3 text-gray-300">Transcript History</h2>
        <div className="mb-4">
          <select
            value={selectedCampaignId ?? ''}
            onChange={(e) => setSelectedCampaignId(Number(e.target.value) || null)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select Campaign</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="text-sm text-gray-500 py-4 text-center">Loading transcripts...</div>
        )}

        {!loading && selectedCampaignId && transcripts.length === 0 && (
          <div className="text-sm text-gray-600 py-8 text-center bg-gray-900 border border-gray-800 rounded-lg">
            <MessageSquareText size={32} className="mx-auto mb-2 text-gray-700" />
            No transcripts yet for this campaign.
            <br />
            <span className="text-gray-500">
              Enable transcription in campaign settings, then transcripts will appear after calls.
            </span>
          </div>
        )}

        <div className="space-y-2">
          {transcripts.map((t) => (
            <div
              key={t.callLogId}
              className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => setExpandedCall(expandedCall === t.callLogId ? null : t.callLogId)}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-800/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {expandedCall === t.callLogId ? (
                    <ChevronDown size={16} className="text-gray-500" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-500" />
                  )}
                  <div>
                    <span className="font-medium text-sm">{t.contactName || t.contactPhone}</span>
                    <span className="text-xs text-gray-500 ml-2">{t.contactPhone}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span
                    className={`px-2 py-0.5 rounded-full ${
                      t.disposition === 'connected'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : t.disposition === 'voicemail'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    {t.disposition || 'unknown'}
                  </span>
                  <span>{t.lines.length} lines</span>
                  {t.callStartedAt && (
                    <span>{new Date(t.callStartedAt).toLocaleDateString()}</span>
                  )}
                </div>
              </button>

              {expandedCall === t.callLogId && (
                <div className="border-t border-gray-800 p-4 space-y-3">
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleRetranscribe(t.callLogId)}
                      disabled={retranscribingId === t.callLogId}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 rounded-lg text-xs transition-colors"
                      title="Re-run STT against the saved recording. Replaces existing transcript lines."
                    >
                      <RefreshCw
                        size={12}
                        className={retranscribingId === t.callLogId ? 'animate-spin' : ''}
                      />
                      {retranscribingId === t.callLogId ? 'Transcribing...' : 'Re-transcribe'}
                    </button>
                  </div>
                  {t.lines.map((line) => (
                    <div key={line.id} className="flex gap-3">
                      <div
                        className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${
                          line.speaker === 'inbound'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        {line.speaker === 'inbound' ? <User size={14} /> : <Mic size={14} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">{line.content}</div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          {line.speaker === 'inbound' ? 'Contact' : 'Operator'}
                          {line.confidence != null && (
                            <span className="ml-2">
                              {Math.round(line.confidence * 100)}% confidence
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {t.lines.length === 0 && (
                    <div className="text-sm text-gray-600 text-center py-2">
                      No transcript lines recorded
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Config modal */}
      {configCampaignId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Transcription Settings</h2>
            <p className="text-sm text-gray-400">
              Configure transcription for{' '}
              <span className="text-gray-200">
                {campaigns.find((c) => c.id === configCampaignId)?.name}
              </span>
            </p>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Transcription Mode</label>
              <div className="space-y-2">
                {(['off', 'post_call', 'realtime'] as const).map((mode) => {
                  const isPostCall = mode === 'post_call';
                  const disabled = isPostCall && !postCallReady;
                  return (
                    <label
                      key={mode}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                        disabled
                          ? 'border-gray-800 bg-gray-900 opacity-50 cursor-not-allowed'
                          : configForm.transcriptionMode === mode
                            ? 'border-emerald-500 bg-emerald-500/10 cursor-pointer'
                            : 'border-gray-700 bg-gray-800 cursor-pointer hover:border-gray-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="mode"
                        value={mode}
                        checked={configForm.transcriptionMode === mode}
                        onChange={() => setConfigForm({ transcriptionMode: mode })}
                        disabled={disabled}
                        className="accent-emerald-500 mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium flex items-center justify-between gap-2">
                          <span>{modeLabels[mode].name}</span>
                          <span className="text-xs text-gray-500 shrink-0">
                            {modeLabels[mode].cost}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {modeLabels[mode].description}
                        </div>
                        {disabled && (
                          <div className="text-xs text-yellow-500 mt-1">
                            Set OPENAI_API_KEY or WHISPER_BATCH_URL in Settings to enable.
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {configForm.transcriptionMode === 'post_call' && (
              <div className="text-xs text-gray-500 bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2">
                Will use{' '}
                <span className="text-gray-300">
                  {hasWhisperUrl ? 'self-hosted Whisper' : 'OpenAI Whisper API'}
                </span>
                . Transcripts appear within ~30 seconds of hangup.
                {!hasWhisperUrl && hasOpenAIKey && (
                  <div className="mt-1 text-yellow-500">
                    OpenAI standard API does not sign HIPAA BAAs. Use self-hosted Whisper for PHI.
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={saveConfig}
                disabled={saving}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setConfigCampaignId(null)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
