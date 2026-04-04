import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import type { Campaign, Contact, DialerStatus } from '../types';
import { Phone, PhoneOff, SkipForward, Mic, Pause, Play, Square, Headphones } from 'lucide-react';

const callStateLabels: Record<string, string> = {
  idle: 'Idle',
  dialing: 'Dialing...',
  ringing: 'Ringing...',
  amd_detecting: 'Detecting...',
  voicemail_dropping: 'Dropping Voicemail',
  human_answered: 'Human Answered!',
  opener_playing: 'Playing Opener',
  operator_bridged: 'You are LIVE',
  ended: 'Call Ended',
};

const statusColors: Record<string, string> = {
  pending: 'bg-gray-500',
  voicemail: 'bg-yellow-500',
  connected: 'bg-emerald-500',
  no_answer: 'bg-red-500',
  callback: 'bg-blue-500',
  not_interested: 'bg-orange-500',
  dnc: 'bg-red-700',
};

export default function Dialer() {
  const ws = useWebSocket();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [dialerStatus, setDialerStatus] = useState<DialerStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.campaigns.list().then(setCampaigns).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedCampaignId) {
      api.contacts.list(selectedCampaignId).then(setContacts).catch(console.error);
    }
  }, [selectedCampaignId, ws.callState]);

  useEffect(() => {
    api.dialer.status().then(setDialerStatus).catch(console.error);
  }, [ws.sessionStatus, ws.callState]);

  const isRunning = ws.sessionStatus === 'running';
  const isPaused = ws.sessionStatus === 'paused';
  const isActive = isRunning || isPaused;
  const isHumanAnswered = ws.callState === 'human_answered' || ws.callState === 'opener_playing';

  const handleStart = async () => {
    if (!selectedCampaignId) return;
    setLoading(true);
    try {
      await api.dialer.start(selectedCampaignId);
    } catch (err: any) {
      alert(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-4">
          <select
            value={selectedCampaignId ?? ''}
            onChange={(e) => setSelectedCampaignId(Number(e.target.value) || null)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            disabled={isActive}
          >
            <option value="">Select Campaign</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {!isActive && (
            <button
              onClick={handleStart}
              disabled={!selectedCampaignId || loading}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              <Phone size={16} /> Start Calling
            </button>
          )}
        </div>
        {isActive && (
          <div className="flex items-center gap-2">
            {isRunning ? (
              <button onClick={() => api.dialer.pause()} className="flex items-center gap-2 px-3 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm">
                <Pause size={16} /> Pause
              </button>
            ) : (
              <button onClick={() => api.dialer.resume()} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm">
                <Play size={16} /> Resume
              </button>
            )}
            <button onClick={() => api.dialer.stop()} className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm">
              <Square size={16} /> Stop
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Contact Queue */}
        <div className="w-64 border-r border-gray-800 overflow-y-auto bg-gray-900/50">
          <div className="p-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Contact Queue ({contacts.length})
          </div>
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className={`flex items-center gap-3 px-3 py-2 border-b border-gray-800/50 text-sm ${
                ws.currentContactId === contact.id ? 'bg-emerald-500/10 border-l-2 border-l-emerald-400' : ''
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusColors[contact.status] || 'bg-gray-500'}`} />
              <div className="min-w-0">
                <div className="truncate font-medium">{contact.name || contact.phone}</div>
                <div className="text-xs text-gray-500 truncate">{contact.company || contact.phone}</div>
              </div>
            </div>
          ))}
          {contacts.length === 0 && (
            <div className="p-4 text-sm text-gray-600 text-center">
              Select a campaign to see contacts
            </div>
          )}
        </div>

        {/* Center panel - Call Status */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          {isActive ? (
            <div className="text-center space-y-6">
              {/* Call state indicator */}
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                ws.callState === 'human_answered' ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' :
                ws.callState === 'operator_bridged' ? 'bg-red-500/20 text-red-400' :
                ws.callState === 'voicemail_dropping' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-gray-800 text-gray-300'
              }`}>
                {ws.callState === 'operator_bridged' && <Mic size={16} />}
                {ws.callState !== 'idle' && ws.callState !== 'operator_bridged' && <Headphones size={16} />}
                {callStateLabels[ws.callState] || ws.callState}
              </div>

              {ws.message && (
                <div className={`font-medium ${
                  ws.message.includes('inconclusive') || ws.message.includes('timed out')
                    ? 'text-yellow-400'
                    : 'text-emerald-400'
                }`}>{ws.message}</div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 justify-center">
                <button
                  onClick={() => api.dialer.jumpIn()}
                  disabled={!isHumanAnswered}
                  className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-sm font-bold transition-colors"
                >
                  <Mic size={18} /> Jump In
                </button>
                <button
                  onClick={() => api.dialer.skip()}
                  className="flex items-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm transition-colors"
                >
                  <SkipForward size={18} /> Skip
                </button>
              </div>

              {/* Session stats */}
              <div className="flex gap-6 text-center text-sm mt-8">
                <div>
                  <div className="text-2xl font-bold">{dialerStatus?.callsMade ?? ws.callLogs.length}</div>
                  <div className="text-gray-500">Calls</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-400">{dialerStatus?.voicemailsDropped ?? 0}</div>
                  <div className="text-gray-500">VMs</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-400">{dialerStatus?.connects ?? 0}</div>
                  <div className="text-gray-500">Connects</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-400">{dialerStatus?.queueRemaining ?? 0}</div>
                  <div className="text-gray-500">Remaining</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <Phone size={48} className="mx-auto text-gray-700" />
              <h2 className="text-xl font-semibold text-gray-400">Ready to Dial</h2>
              <p className="text-sm text-gray-600 max-w-md">
                Select a campaign and click Start Calling. Put on your headset — voicemails are handled automatically.
                You'll only engage when a live human picks up.
              </p>
            </div>
          )}
        </div>

        {/* Right panel - Call Log */}
        <div className="w-72 border-l border-gray-800 overflow-y-auto bg-gray-900/50">
          <div className="p-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Call Log
          </div>
          {ws.callLogs.map((log, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 border-b border-gray-800/50 text-sm">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                log.disposition === 'voicemail' ? 'bg-yellow-500' :
                log.disposition === 'connected' ? 'bg-emerald-500' :
                'bg-red-500'
              }`} />
              <div className="min-w-0">
                <div className="truncate">#{log.contactId}</div>
                <div className="text-xs text-gray-500">{log.disposition}</div>
              </div>
            </div>
          ))}
          {ws.callLogs.length === 0 && (
            <div className="p-4 text-sm text-gray-600 text-center">
              No calls yet
            </div>
          )}
        </div>
      </div>

      {/* Error bar */}
      {ws.error && (
        <div className="p-3 bg-red-900/50 border-t border-red-800 text-red-300 text-sm">
          {ws.error}
        </div>
      )}
    </div>
  );
}
