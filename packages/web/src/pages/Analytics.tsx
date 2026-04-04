import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Campaign } from '../types';
import { Download, BarChart3, Phone, Voicemail, UserCheck, Clock } from 'lucide-react';

interface CampaignStats {
  campaign: { id: number; name: string; status: string };
  contacts: {
    total: number;
    pending: number;
    completed: number;
    breakdown: Record<string, number>;
  };
  calls: {
    total: number;
    totalDurationSeconds: number;
    avgDurationSeconds: number;
    humanTakeovers: number;
    breakdown: Record<string, number>;
  };
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function Analytics() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.campaigns.list().then(setCampaigns).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedCampaignId) { setStats(null); return; }
    setLoading(true);
    api.analytics.campaignStats(selectedCampaignId)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedCampaignId]);

  const dispositionColors: Record<string, string> = {
    connected: 'bg-emerald-500',
    voicemail: 'bg-yellow-500',
    no_answer: 'bg-red-500',
    busy: 'bg-orange-500',
    failed: 'bg-gray-500',
  };

  const contactStatusColors: Record<string, string> = {
    pending: 'bg-gray-500',
    connected: 'bg-emerald-500',
    voicemail: 'bg-yellow-500',
    no_answer: 'bg-red-500',
    callback: 'bg-blue-500',
    not_interested: 'bg-orange-500',
    dnc: 'bg-red-700',
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex items-center gap-3">
          <select
            value={selectedCampaignId ?? ''}
            onChange={(e) => setSelectedCampaignId(Number(e.target.value) || null)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select Campaign</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Export buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => api.analytics.exportSummary()}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm transition-colors"
        >
          <Download size={14} /> Export All Campaigns (CSV)
        </button>
        {selectedCampaignId && (
          <>
            <button
              onClick={() => api.analytics.exportContacts(selectedCampaignId)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm transition-colors"
            >
              <Download size={14} /> Export Contacts (CSV)
            </button>
            <button
              onClick={() => api.analytics.exportCallLogs(selectedCampaignId)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm transition-colors"
            >
              <Download size={14} /> Export Call Logs (CSV)
            </button>
          </>
        )}
      </div>

      {loading && <div className="text-gray-500 py-8 text-center">Loading stats...</div>}

      {!selectedCampaignId && !loading && (
        <div className="text-center py-16">
          <BarChart3 size={48} className="mx-auto text-gray-700 mb-4" />
          <h2 className="text-xl font-semibold text-gray-400">Select a Campaign</h2>
          <p className="text-sm text-gray-600 mt-2">Choose a campaign to view its analytics and export data.</p>
        </div>
      )}

      {stats && !loading && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <Phone size={14} /> Total Calls
              </div>
              <div className="text-3xl font-bold">{stats.calls.total}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <UserCheck size={14} /> Connects
              </div>
              <div className="text-3xl font-bold text-emerald-400">
                {stats.calls.breakdown.connected ?? 0}
              </div>
              {stats.calls.total > 0 && (
                <div className="text-xs text-gray-500 mt-1">
                  {Math.round(((stats.calls.breakdown.connected ?? 0) / stats.calls.total) * 100)}% connect rate
                </div>
              )}
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <Voicemail size={14} /> Voicemails
              </div>
              <div className="text-3xl font-bold text-yellow-400">
                {stats.calls.breakdown.voicemail ?? 0}
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <Clock size={14} /> Talk Time
              </div>
              <div className="text-3xl font-bold">
                {formatDuration(stats.calls.totalDurationSeconds)}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Avg: {formatDuration(stats.calls.avgDurationSeconds)}
              </div>
            </div>
          </div>

          {/* Contact progress */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Contact Progress</h3>
            {stats.contacts.total > 0 && (
              <div className="mb-3">
                <div className="flex justify-between text-sm mb-1">
                  <span>{stats.contacts.completed} of {stats.contacts.total} contacted</span>
                  <span>{Math.round((stats.contacts.completed / stats.contacts.total) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full transition-all"
                    style={{ width: `${(stats.contacts.completed / stats.contacts.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-4">
              {Object.entries(stats.contacts.breakdown).map(([status, count]) => (
                <div key={status} className="flex items-center gap-2 text-sm">
                  <span className={`w-2.5 h-2.5 rounded-full ${contactStatusColors[status] || 'bg-gray-500'}`} />
                  <span className="text-gray-400 capitalize">{status.replace('_', ' ')}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Call disposition breakdown */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Call Dispositions</h3>
            {stats.calls.total > 0 ? (
              <>
                {/* Horizontal bar */}
                <div className="flex rounded-full h-3 overflow-hidden mb-4">
                  {Object.entries(stats.calls.breakdown).map(([disposition, count]) => (
                    <div
                      key={disposition}
                      className={`${dispositionColors[disposition] || 'bg-gray-500'} transition-all`}
                      style={{ width: `${(count / stats.calls.total) * 100}%` }}
                      title={`${disposition}: ${count}`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(stats.calls.breakdown).map(([disposition, count]) => (
                    <div key={disposition} className="flex items-center gap-2 text-sm">
                      <span className={`w-2.5 h-2.5 rounded-full ${dispositionColors[disposition] || 'bg-gray-500'}`} />
                      <span className="text-gray-400 capitalize">{disposition.replace('_', ' ')}</span>
                      <span className="font-medium">{count}</span>
                      <span className="text-gray-600">({Math.round((count / stats.calls.total) * 100)}%)</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-600 text-center py-4">No calls made yet.</div>
            )}
          </div>

          {/* Human takeover stat */}
          {stats.calls.humanTakeovers > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400">Human Takeovers (Jump-Ins)</div>
              <div className="text-2xl font-bold mt-1">{stats.calls.humanTakeovers}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
