import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTelnyxClient } from '../hooks/useTelnyxClient';
import { useUser } from '../App';
import OperatorStatusPanel from '../components/OperatorStatusPanel';
import IncomingCallCard from '../components/IncomingCallCard';
import Soundboard from '../components/Soundboard';
import type { Campaign, Contact, DialerStatus, OperatorAvailability } from '../types';
import {
  Phone,
  SkipForward,
  Mic,
  Pause,
  Play,
  Square,
  Headphones,
  Wifi,
  WifiOff,
  LogIn,
  LogOut,
  UserCheck,
  Clock,
  PhoneIncoming,
  MessageSquareText,
} from 'lucide-react';

const callStateLabels: Record<string, string> = {
  idle: 'Idle',
  dialing: 'Dialing...',
  ringing: 'Ringing...',
  amd_detecting: 'Detecting...',
  voicemail_dropping: 'Dropping Voicemail',
  human_answered: 'Human Answered!',
  opener_playing: 'Playing Opener',
  operator_bridged: 'You are LIVE',
  waiting_for_operator: 'Waiting for Operator',
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

function LiveTranscript({ lines }: { lines: Array<{ speaker: string; content: string; confidence: number | null; timestamp: string }> }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  return (
    <div className="w-full max-w-lg mt-6 flex flex-col max-h-48 overflow-hidden">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
        <MessageSquareText size={14} />
        Live Transcript
      </div>
      <div className="flex-1 overflow-y-auto space-y-1.5 bg-gray-900/50 rounded-lg p-3 border border-gray-800">
        {lines.map((line, i) => (
          <div key={i} className="flex gap-2 text-sm">
            <span
              className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded ${
                line.speaker === 'inbound'
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}
            >
              {line.speaker === 'inbound' ? 'Them' : 'You'}
            </span>
            <span className="text-gray-300">{line.content}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default function Dialer() {
  const user = useUser();
  const isAdmin = user?.role === 'admin';
  const ws = useWebSocket();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [dialerStatus, setDialerStatus] = useState<DialerStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [webrtcCreds, setWebrtcCreds] = useState<{ login: string; password: string } | null>(null);
  const [webrtcRegistered, setWebrtcRegistered] = useState(false);

  // Operator-specific state
  const [hasJoined, setHasJoined] = useState(false);
  const [operatorAvailability, setOperatorAvailability] = useState<OperatorAvailability>('offline');

  const telnyx = useTelnyxClient(webrtcCreds || undefined);

  // Fetch campaigns (admin needs to select one)
  useEffect(() => {
    if (isAdmin) {
      api.campaigns.list().then(setCampaigns).catch(console.error);
    }
  }, [isAdmin]);

  // Fetch contacts for selected campaign
  useEffect(() => {
    if (selectedCampaignId) {
      api.contacts.list(selectedCampaignId).then(setContacts).catch(console.error);
    }
  }, [selectedCampaignId, ws.callState]);

  // Fetch dialer status and init operator state
  useEffect(() => {
    api.dialer
      .status()
      .then((status) => {
        setDialerStatus(status);
        if (user) {
          const me = status.operators.find((op) => op.userId === user.userId);
          if (me) {
            setHasJoined(true);
            setOperatorAvailability(me.availability);
          }
        }
      })
      .catch(console.error);
  }, [ws.sessionStatus]);

  // Sync operator availability from SSE
  useEffect(() => {
    if (!user) return;
    const me = ws.operators.find((op) => op.userId === user.userId);
    if (me) {
      setOperatorAvailability(me.availability);
    } else if (hasJoined && ws.operators.length > 0) {
      // We were removed from the operator list (session stopped)
      setHasJoined(false);
      setOperatorAvailability('offline');
    }
  }, [ws.operators, user]);

  // Fetch WebRTC credentials on mount
  useEffect(() => {
    api.dialer.webrtcCredentials().then(setWebrtcCreds).catch(() => {});
  }, []);

  // Auto-connect WebRTC when credentials are available
  useEffect(() => {
    if (webrtcCreds && !telnyx.isConnected) {
      telnyx.connect();
    }
  }, [webrtcCreds]);

  // Register WebRTC call leg with the server
  useEffect(() => {
    if (telnyx.isConnected && telnyx.callControlId && !webrtcRegistered) {
      api.dialer
        .registerWebrtc(telnyx.callControlId)
        .then(() => setWebrtcRegistered(true))
        .catch(console.error);
    }
    if (!telnyx.isConnected) setWebrtcRegistered(false);
  }, [telnyx.isConnected, telnyx.callControlId]);

  const isRunning = ws.sessionStatus === 'running';
  const isPaused = ws.sessionStatus === 'paused';
  const isActive = isRunning || isPaused;
  const isHumanAnswered = ws.callState === 'human_answered' || ws.callState === 'opener_playing';

  // --- Admin actions ---
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

  // --- Operator actions ---
  const handleJoin = async () => {
    setLoading(true);
    try {
      const res = await api.dialer.join();
      setHasJoined(true);
      setOperatorAvailability('available');
      if (res.webrtcCredentials) {
        setWebrtcCreds(res.webrtcCredentials);
      }
    } catch (err: any) {
      alert(err.message);
    }
    setLoading(false);
  };

  const handleLeave = async () => {
    try {
      await api.dialer.leave();
      setHasJoined(false);
      setOperatorAvailability('offline');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSetAvailable = async () => {
    try {
      await api.dialer.setAvailable();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSetWrapUp = async () => {
    try {
      await api.dialer.setWrapUp();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // --- WebRTC status badge ---
  const WebrtcBadge = () => (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
        telnyx.isConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
      }`}
    >
      {telnyx.isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
      {telnyx.isConnected ? 'WebRTC Connected' : 'WebRTC Disconnected'}
    </div>
  );

  // --- Availability badge ---
  const AvailabilityBadge = () => {
    const config: Record<string, { bg: string; text: string; label: string }> = {
      available: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Available' },
      on_call: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'On Call' },
      wrap_up: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Wrap-Up' },
      offline: { bg: 'bg-gray-500/10', text: 'text-gray-400', label: 'Offline' },
    };
    const cfg = config[operatorAvailability] || config.offline;
    return (
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${cfg.bg} ${cfg.text}`}>
        <UserCheck size={14} />
        {cfg.label}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-4">
          {/* Admin: campaign selector + session controls */}
          {isAdmin && (
            <>
              <select
                value={selectedCampaignId ?? ''}
                onChange={(e) => setSelectedCampaignId(Number(e.target.value) || null)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                disabled={isActive}
              >
                <option value="">Select Campaign</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <WebrtcBadge />
              {!isActive && (
                <button
                  onClick={handleStart}
                  disabled={!selectedCampaignId || loading}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                >
                  <Phone size={16} /> Start Calling
                </button>
              )}
            </>
          )}

          {/* Operator: join/leave + availability */}
          {!isAdmin && (
            <>
              {!hasJoined ? (
                <button
                  onClick={handleJoin}
                  disabled={loading || !isActive}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                >
                  <LogIn size={16} /> Join Session
                </button>
              ) : (
                <button
                  onClick={handleLeave}
                  disabled={operatorAvailability === 'on_call'}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                >
                  <LogOut size={16} /> Leave Session
                </button>
              )}
              <AvailabilityBadge />
              <WebrtcBadge />
              {hasJoined && operatorAvailability === 'available' && (
                <button
                  onClick={handleSetWrapUp}
                  className="px-3 py-1.5 bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 rounded-lg text-xs font-medium transition-colors"
                >
                  Enter Wrap-Up
                </button>
              )}
              {hasJoined && operatorAvailability === 'wrap_up' && (
                <button
                  onClick={handleSetAvailable}
                  className="px-3 py-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-lg text-xs font-medium transition-colors"
                >
                  Go Available
                </button>
              )}
            </>
          )}
        </div>

        {/* Admin session controls (right side) */}
        {isAdmin && isActive && (
          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                onClick={() => api.dialer.pause()}
                className="flex items-center gap-2 px-3 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm"
              >
                <Pause size={16} /> Pause
              </button>
            ) : (
              <button
                onClick={() => api.dialer.resume()}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm"
              >
                <Play size={16} /> Resume
              </button>
            )}
            <button
              onClick={() => api.dialer.stop()}
              className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm"
            >
              <Square size={16} /> Stop
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Contact Queue (admin only) */}
        {isAdmin && (
          <div className="w-64 border-r border-gray-800 overflow-y-auto bg-gray-900/50">
            <div className="p-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Contact Queue ({contacts.length})
            </div>
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className={`flex items-center gap-3 px-3 py-2 border-b border-gray-800/50 text-sm ${
                  ws.currentContactId === contact.id
                    ? 'bg-emerald-500/10 border-l-2 border-l-emerald-400'
                    : ''
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${statusColors[contact.status] || 'bg-gray-500'}`}
                />
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
        )}

        {/* Center panel */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-hidden">
          {/* Admin center content */}
          {isAdmin && isActive && (
            <div className="text-center space-y-6">
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                  ws.callState === 'human_answered'
                    ? 'bg-emerald-500/20 text-emerald-400 animate-pulse'
                    : ws.callState === 'operator_bridged'
                      ? 'bg-red-500/20 text-red-400'
                      : ws.callState === 'voicemail_dropping'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-gray-800 text-gray-300'
                }`}
              >
                {ws.callState === 'operator_bridged' && <Mic size={16} />}
                {ws.callState !== 'idle' && ws.callState !== 'operator_bridged' && (
                  <Headphones size={16} />
                )}
                {callStateLabels[ws.callState] || ws.callState}
              </div>

              {ws.message && (
                <div
                  className={`font-medium ${
                    ws.message.includes('inconclusive') || ws.message.includes('timed out')
                      ? 'text-yellow-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {ws.message}
                </div>
              )}

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

              <div className="flex gap-6 text-center text-sm mt-8">
                <div>
                  <div className="text-2xl font-bold">
                    {dialerStatus?.callsMade ?? ws.callLogs.length}
                  </div>
                  <div className="text-gray-500">Calls</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {dialerStatus?.voicemailsDropped ?? 0}
                  </div>
                  <div className="text-gray-500">VMs</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {dialerStatus?.connects ?? 0}
                  </div>
                  <div className="text-gray-500">Connects</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-400">
                    {dialerStatus?.queueRemaining ?? 0}
                  </div>
                  <div className="text-gray-500">Remaining</div>
                </div>
              </div>
            </div>
          )}

          {isAdmin && !isActive && (
            <div className="text-center space-y-4">
              <Phone size={48} className="mx-auto text-gray-700" />
              <h2 className="text-xl font-semibold text-gray-400">Ready to Dial</h2>
              <p className="text-sm text-gray-600 max-w-md">
                Select a campaign and click Start Calling. Operators will receive calls automatically
                when humans pick up.
              </p>
            </div>
          )}

          {/* Operator center content */}
          {!isAdmin && !hasJoined && (
            <div className="text-center space-y-4">
              <PhoneIncoming size={48} className="mx-auto text-gray-700" />
              <h2 className="text-xl font-semibold text-gray-400">Join a Session</h2>
              <p className="text-sm text-gray-600 max-w-md">
                {isActive
                  ? 'A dialing session is active. Click "Join Session" to start receiving calls.'
                  : 'No active session. Wait for an admin to start a campaign.'}
              </p>
            </div>
          )}

          {!isAdmin && hasJoined && operatorAvailability === 'available' && !ws.routedCall && (
            <div className="text-center space-y-4">
              <div className="relative mx-auto w-16 h-16">
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping" />
                <div className="relative flex items-center justify-center w-16 h-16 bg-emerald-500/10 rounded-full">
                  <Headphones size={28} className="text-emerald-400" />
                </div>
              </div>
              <h2 className="text-xl font-semibold text-gray-300">Waiting for Calls</h2>
              <p className="text-sm text-gray-600">
                You'll be connected automatically when a live human picks up.
              </p>
            </div>
          )}

          {!isAdmin && hasJoined && ws.routedCall && (
            <>
              <IncomingCallCard routedCall={ws.routedCall} />
              <Soundboard
                callControlId={ws.routedCall.callControlId}
                contactName={ws.routedCall.contactName}
              />
            </>
          )}

          {!isAdmin &&
            hasJoined &&
            operatorAvailability === 'on_call' &&
            !ws.routedCall && (
              <div className="text-center space-y-4">
                {ws.muted ? (
                  <>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-500/20 text-yellow-400 text-sm font-medium animate-pulse">
                      <Headphones size={16} />
                      Greeting Playing — You're Muted
                    </div>
                    <p className="text-sm text-gray-500">You can hear the call. Click below when ready to speak.</p>
                    <button
                      onClick={async () => {
                        if (ws.activeCallControlId) {
                          await api.dialer.stopAndTalk(ws.activeCallControlId);
                        }
                      }}
                      className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Mic size={18} /> Stop & Talk
                      </span>
                    </button>
                  </>
                ) : (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/20 text-red-400 text-sm font-medium">
                    <Mic size={16} />
                    You are LIVE
                  </div>
                )}
              </div>
            )}

          {!isAdmin && hasJoined && operatorAvailability === 'wrap_up' && (
            <div className="text-center space-y-4">
              <Clock size={48} className="mx-auto text-yellow-500" />
              <h2 className="text-xl font-semibold text-yellow-400">Wrap-Up</h2>
              <p className="text-sm text-gray-600 mb-4">
                Take notes, then click below when you're ready for the next call.
              </p>
              <button
                onClick={handleSetAvailable}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold transition-colors"
              >
                <span className="flex items-center gap-2">
                  <UserCheck size={18} /> Go Available
                </span>
              </button>
            </div>
          )}

          {/* Live Transcript */}
          {ws.transcriptLines.length > 0 && (
            <LiveTranscript lines={ws.transcriptLines} />
          )}
        </div>

        {/* Right panel */}
        <div className="w-72 border-l border-gray-800 flex flex-col bg-gray-900/50">
          {/* Operator panel (admin only) */}
          {isAdmin && (
            <OperatorStatusPanel
              operators={dialerStatus?.operators ?? ws.operators}
              waitingCalls={dialerStatus?.waitingCalls ?? ws.waitingCalls}
            />
          )}

          {/* Call Log */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Call Log
            </div>
            {ws.callLogs.map((log, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2 border-b border-gray-800/50 text-sm"
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    log.disposition === 'voicemail'
                      ? 'bg-yellow-500'
                      : log.disposition === 'connected'
                        ? 'bg-emerald-500'
                        : 'bg-red-500'
                  }`}
                />
                <div className="min-w-0">
                  <div className="truncate">#{log.contactId}</div>
                  <div className="text-xs text-gray-500">{log.disposition}</div>
                </div>
              </div>
            ))}
            {ws.callLogs.length === 0 && (
              <div className="p-4 text-sm text-gray-600 text-center">No calls yet</div>
            )}
          </div>
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
