import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import type { Campaign, Contact } from '../types';
import { Upload, Plus, Trash2, X } from 'lucide-react';
import Papa from 'papaparse';

export default function Contacts() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Array<Record<string, string>> | null>(null);
  const [addForm, setAddForm] = useState({ name: '', phone: '', company: '', email: '', notes: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api.campaigns.list().then(setCampaigns).catch(console.error);
    if (selectedCampaignId) {
      api.contacts.list(selectedCampaignId).then(setContacts).catch(console.error);
    }
  };

  useEffect(() => { api.campaigns.list().then(setCampaigns).catch(console.error); }, []);
  useEffect(load, [selectedCampaignId]);

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvPreview(results.data as Array<Record<string, string>>);
      },
    });
  };

  const handleCsvImport = async () => {
    if (!csvPreview || !selectedCampaignId) return;
    const mapped = csvPreview.map((row) => ({
      name: row.name || row.Name || '',
      phone: row.phone || row.Phone || row.phone_number || '',
      company: row.company || row.Company || '',
      email: row.email || row.Email || '',
      notes: row.notes || row.Notes || '',
    })).filter((c) => c.phone);

    await api.contacts.bulkImport(selectedCampaignId, mapped);
    setCsvPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    load();
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaignId) return;
    await api.contacts.create({ campaignId: selectedCampaignId, ...addForm });
    setShowAddForm(false);
    setAddForm({ name: '', phone: '', company: '', email: '', notes: '' });
    load();
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-gray-700 text-gray-300',
      voicemail: 'bg-yellow-900 text-yellow-300',
      connected: 'bg-emerald-900 text-emerald-300',
      no_answer: 'bg-red-900 text-red-300',
      callback: 'bg-blue-900 text-blue-300',
      not_interested: 'bg-orange-900 text-orange-300',
      dnc: 'bg-red-950 text-red-400',
    };
    return `px-2 py-0.5 rounded text-xs font-medium ${colors[status] || colors.pending}`;
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <div className="flex items-center gap-3">
          <select
            value={selectedCampaignId ?? ''}
            onChange={(e) => setSelectedCampaignId(Number(e.target.value) || null)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {selectedCampaignId && (
            <>
              <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium cursor-pointer transition-colors">
                <Upload size={16} /> Import CSV
                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
              </label>
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={16} /> Add Contact
              </button>
            </>
          )}
        </div>
      </div>

      {/* CSV Preview */}
      {csvPreview && (
        <div className="mb-6 bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">CSV Preview ({csvPreview.length} contacts)</h3>
            <div className="flex gap-2">
              <button onClick={handleCsvImport} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-sm">
                Import All
              </button>
              <button onClick={() => setCsvPreview(null)} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm">
                Cancel
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-48">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  {csvPreview[0] && Object.keys(csvPreview[0]).map((key) => (
                    <th key={key} className="pb-2 pr-4 font-medium">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvPreview.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="py-1.5 pr-4 text-gray-300">{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {csvPreview.length > 5 && (
              <div className="text-xs text-gray-500 mt-2">...and {csvPreview.length - 5} more</div>
            )}
          </div>
        </div>
      )}

      {/* Contact table */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-800 bg-gray-900">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Calls</th>
              <th className="px-4 py-3 font-medium w-12"></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-4 py-3">{c.name || '—'}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.phone}</td>
                <td className="px-4 py-3 text-gray-400">{c.company || '—'}</td>
                <td className="px-4 py-3"><span className={statusBadge(c.status)}>{c.status}</span></td>
                <td className="px-4 py-3 text-gray-400">{c.callCount}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={async () => { await api.contacts.delete(c.id); load(); }}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {contacts.length === 0 && (
          <div className="text-center py-12 text-gray-600">
            {selectedCampaignId ? 'No contacts in this campaign. Import a CSV or add manually.' : 'Select a campaign to view contacts.'}
          </div>
        )}
      </div>

      {/* Add Contact Form */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form onSubmit={handleAddContact} className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Contact</h2>
              <button type="button" onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-200"><X size={20} /></button>
            </div>
            {(['name', 'phone', 'company', 'email', 'notes'] as const).map((field) => (
              <div key={field}>
                <label className="block text-sm text-gray-400 mb-1 capitalize">{field}</label>
                <input
                  value={addForm[field]}
                  onChange={(e) => setAddForm({ ...addForm, [field]: e.target.value })}
                  required={field === 'phone'}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                  placeholder={field === 'phone' ? '+16025551234' : ''}
                />
              </div>
            ))}
            <button type="submit" className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">
              Add Contact
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
