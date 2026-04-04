import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Campaign, Recording } from '../types';
import { Plus, Trash2, Edit2, X } from 'lucide-react';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<(Campaign & { contactCount: number })[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState({ name: '', callerId: '', openerRecordingId: '', voicemailRecordingId: '' });

  const load = () => {
    api.campaigns.list().then(setCampaigns).catch(console.error);
    api.recordings.list().then(setRecordings).catch(console.error);
  };

  useEffect(load, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: form.name,
      callerId: form.callerId,
      openerRecordingId: form.openerRecordingId ? Number(form.openerRecordingId) : undefined,
      voicemailRecordingId: form.voicemailRecordingId ? Number(form.voicemailRecordingId) : undefined,
    };

    if (editing) {
      await api.campaigns.update(editing.id, data);
    } else {
      await api.campaigns.create(data);
    }

    setShowForm(false);
    setEditing(null);
    setForm({ name: '', callerId: '', openerRecordingId: '', voicemailRecordingId: '' });
    load();
  };

  const handleEdit = (c: Campaign) => {
    setEditing(c);
    setForm({
      name: c.name,
      callerId: c.callerId,
      openerRecordingId: c.openerRecordingId?.toString() || '',
      voicemailRecordingId: c.voicemailRecordingId?.toString() || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this campaign and all its contacts?')) return;
    await api.campaigns.delete(id);
    load();
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-700 text-gray-300',
      active: 'bg-emerald-900 text-emerald-300',
      paused: 'bg-yellow-900 text-yellow-300',
      completed: 'bg-blue-900 text-blue-300',
    };
    return `px-2 py-0.5 rounded text-xs font-medium ${colors[status] || colors.draft}`;
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <button
          onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', callerId: '', openerRecordingId: '', voicemailRecordingId: '' }); }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> New Campaign
        </button>
      </div>

      {/* Campaign list */}
      <div className="space-y-3">
        {campaigns.map((c) => (
          <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{c.name}</span>
                <span className={statusBadge(c.status)}>{c.status}</span>
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {c.contactCount} contacts &middot; Caller ID: {c.callerId}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleEdit(c)} className="p-2 text-gray-400 hover:text-gray-200 transition-colors">
                <Edit2 size={16} />
              </button>
              <button onClick={() => handleDelete(c.id)} className="p-2 text-gray-400 hover:text-red-400 transition-colors">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {campaigns.length === 0 && (
          <div className="text-center py-12 text-gray-600">No campaigns yet. Create one to get started.</div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editing ? 'Edit Campaign' : 'New Campaign'}</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-200">
                <X size={20} />
              </button>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Campaign Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g., Dental Practices Q2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Caller ID (Phone Number)</label>
              <input
                value={form.callerId}
                onChange={(e) => setForm({ ...form, callerId: e.target.value })}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                placeholder="+16025551234"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Opener Recording</label>
              <select
                value={form.openerRecordingId}
                onChange={(e) => setForm({ ...form, openerRecordingId: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {recordings.filter((r) => r.type === 'opener').map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Voicemail Drop Recording</label>
              <select
                value={form.voicemailRecordingId}
                onChange={(e) => setForm({ ...form, voicemailRecordingId: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {recordings.filter((r) => r.type === 'voicemail').map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">
              {editing ? 'Update Campaign' : 'Create Campaign'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
