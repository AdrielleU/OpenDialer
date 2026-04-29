import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Campaign, Recording } from '../types';
import { Plus, Trash2, Edit2, X, Phone } from 'lucide-react';
import IvrBuilder from '../components/IvrBuilder';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<(Campaign & { contactCount: number })[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState({
    name: '',
    callerId: '',
    openerRecordingId: '',
    voicemailRecordingId: '',
    failoverRecordingId: '',
    dropIfNoOperator: true,
    maxAttempts: 1,
    retryAfterMinutes: 60,
    prioritizeVoicemails: true,
    ivrSequence: '',
    ivrGreetingType: 'none' as string,
    ivrGreetingTemplate: '',
  });

  const load = () => {
    api.campaigns.list().then(setCampaigns).catch(console.error);
    api.recordings.list().then(setRecordings).catch(console.error);
  };

  useEffect(load, []);

  const resetForm = () => ({
    name: '',
    callerId: '',
    openerRecordingId: '',
    voicemailRecordingId: '',
    failoverRecordingId: '',
    dropIfNoOperator: true,
    maxAttempts: 1,
    retryAfterMinutes: 60,
    prioritizeVoicemails: true,
    ivrSequence: '',
    ivrGreetingType: 'none' as string,
    ivrGreetingTemplate: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: form.name,
      callerId: form.callerId,
      openerRecordingId: form.openerRecordingId ? Number(form.openerRecordingId) : undefined,
      voicemailRecordingId: form.voicemailRecordingId ? Number(form.voicemailRecordingId) : undefined,
      failoverRecordingId: form.failoverRecordingId ? Number(form.failoverRecordingId) : undefined,
      dropIfNoOperator: form.dropIfNoOperator,
      maxAttempts: form.maxAttempts,
      retryAfterMinutes: form.retryAfterMinutes,
      prioritizeVoicemails: form.prioritizeVoicemails,
      ivrSequence: form.ivrSequence || null,
      ivrGreetingType: (form.ivrGreetingType || 'none') as 'none' | 'recording' | 'tts',
      ivrGreetingTemplate: form.ivrGreetingTemplate || null,
    };

    if (editing) {
      await api.campaigns.update(editing.id, data);
    } else {
      await api.campaigns.create(data);
    }

    setShowForm(false);
    setEditing(null);
    setForm(resetForm());
    load();
  };

  const handleEdit = (c: Campaign) => {
    setEditing(c);
    setForm({
      name: c.name,
      callerId: c.callerId,
      openerRecordingId: c.openerRecordingId?.toString() || '',
      voicemailRecordingId: c.voicemailRecordingId?.toString() || '',
      failoverRecordingId: c.failoverRecordingId?.toString() || '',
      dropIfNoOperator: (c as any).dropIfNoOperator ?? true,
      maxAttempts: (c as any).maxAttempts ?? 1,
      retryAfterMinutes: (c as any).retryAfterMinutes ?? 60,
      prioritizeVoicemails: (c as any).prioritizeVoicemails ?? true,
      ivrSequence: (c as any).ivrSequence || '',
      ivrGreetingType: (c as any).ivrGreetingType || 'none',
      ivrGreetingTemplate: (c as any).ivrGreetingTemplate || '',
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
          onClick={() => { setShowForm(true); setEditing(null); setForm(resetForm()); }}
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
                {(c as any).ivrSequence && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-900 text-blue-300">
                    IVR
                  </span>
                )}
                {(c as any).dropIfNoOperator && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-900 text-orange-300">
                    Drop if busy
                  </span>
                )}
                {((c as any).maxAttempts ?? 1) > 1 && (
                  <span
                    className="px-2 py-0.5 rounded text-xs font-medium bg-purple-900 text-purple-300"
                    title={`Up to ${(c as any).maxAttempts} attempts, ${(c as any).retryAfterMinutes ?? 60}m apart`}
                  >
                    Retry x{(c as any).maxAttempts}
                  </span>
                )}
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
          <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
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
                placeholder="e.g., Q2 Claim Follow-ups"
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
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Failover Recording
                <span className="ml-2 text-xs text-gray-600">(optional)</span>
              </label>
              <select
                value={form.failoverRecordingId}
                onChange={(e) => setForm({ ...form, failoverRecordingId: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {recordings.filter((r) => r.type === 'failover').map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-600 mt-1">
                Plays to the contact if the operator disconnects mid-call
                (e.g. "Sorry, we got cut off — we'll call you right back").
              </p>
            </div>

            {/* Call behavior */}
            <div className="border-t border-gray-800 pt-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Call Behavior</h3>
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={form.dropIfNoOperator}
                  onChange={(e) => setForm({ ...form, dropIfNoOperator: e.target.checked })}
                  className="accent-emerald-500 w-4 h-4"
                />
                <div>
                  <div className="text-sm font-medium">Drop if no operator available</div>
                  <div className="text-xs text-gray-500">Hang up and retry later instead of making the contact wait</div>
                </div>
              </label>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Max attempts per contact</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={form.maxAttempts}
                    onChange={(e) => setForm({ ...form, maxAttempts: Number(e.target.value) || 1 })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                  />
                  <p className="text-[11px] text-gray-600 mt-1">
                    1 = call once. Higher values let voicemail-receiving contacts be re-dialed.
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Retry after (minutes)</label>
                  <input
                    type="number"
                    min={0}
                    max={10080}
                    value={form.retryAfterMinutes}
                    onChange={(e) =>
                      setForm({ ...form, retryAfterMinutes: Number(e.target.value) || 0 })
                    }
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                    disabled={form.maxAttempts <= 1}
                  />
                  <p className="text-[11px] text-gray-600 mt-1">
                    Minimum gap between attempts on the same contact.
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.prioritizeVoicemails}
                  onChange={(e) =>
                    setForm({ ...form, prioritizeVoicemails: e.target.checked })
                  }
                  disabled={form.maxAttempts <= 1}
                  className="accent-emerald-500 w-4 h-4 disabled:opacity-40"
                />
                <div>
                  <div className="text-sm font-medium">Prioritize voicemail-receiving contacts</div>
                  <div className="text-xs text-gray-500">
                    Re-dial contacts that already heard your voicemail before fresh contacts —
                    second-touch attempts tend to convert higher.
                  </div>
                </div>
              </label>
            </div>

            {/* IVR Navigation */}
            <div className="border-t border-gray-800 pt-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-1">IVR Navigation</h3>
              <p className="text-xs text-gray-500 mb-3">
                Navigate phone menus automatically before connecting an operator.
                Add wait + press steps to reach the right department.
              </p>
              <IvrBuilder
                value={form.ivrSequence}
                onChange={(seq) => setForm({ ...form, ivrSequence: seq })}
              />

              {/* IVR Greeting — plays after navigating the phone tree */}
              {form.ivrSequence && (
                <div className="mt-4 pt-3 border-t border-gray-800">
                  <label className="block text-sm text-gray-400 mb-2">
                    Greeting after IVR navigation
                  </label>
                  <div className="space-y-2 mb-3">
                    {([
                      { value: 'none', label: 'None — connect operator immediately' },
                      { value: 'recording', label: 'Play opener recording' },
                      { value: 'tts', label: 'Text-to-speech (dynamic per contact)' },
                    ] as const).map(({ value, label }) => (
                      <label
                        key={value}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                          form.ivrGreetingType === value
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : 'border-gray-700 bg-gray-800'
                        }`}
                      >
                        <input
                          type="radio"
                          name="ivrGreeting"
                          checked={form.ivrGreetingType === value}
                          onChange={() => setForm({ ...form, ivrGreetingType: value })}
                          className="accent-emerald-500"
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    ))}
                  </div>

                  {form.ivrGreetingType === 'tts' && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        TTS Template — use {'{{name}}'}, {'{{company}}'}, {'{{notes}}'} for contact data
                      </label>
                      <textarea
                        value={form.ivrGreetingTemplate}
                        onChange={(e) => setForm({ ...form, ivrGreetingTemplate: e.target.value })}
                        rows={3}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                        placeholder="Hi, I'm calling from ABC Insurance regarding claim number {{notes}} for {{name}}. Please hold for an agent."
                      />
                    </div>
                  )}
                </div>
              )}
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
