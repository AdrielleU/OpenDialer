import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Save, CheckCircle, AlertCircle, Loader } from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    PROVIDER: 'telnyx',
    TELNYX_API_KEY: '',
    TELNYX_CONNECTION_ID: '',
    TELNYX_PHONE_NUMBER: '',
    WEBHOOK_BASE_URL: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [health, setHealth] = useState<{ status: string; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api.settings.get().then((data) => {
      setSettings((s) => ({ ...s, ...data }));
    }).catch(console.error);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.settings.update(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message);
    }
    setSaving(false);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const result = await api.settings.health();
      setHealth(result);
    } catch {
      setHealth({ status: 'error', message: 'Failed to check health' });
    }
    setTesting(false);
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Provider */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Telephony Provider</h2>
          <div className="flex gap-4">
            {['telnyx', 'twilio'].map((p) => (
              <label key={p} className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                settings.PROVIDER === p ? 'border-emerald-500 bg-emerald-500/10' : 'border-gray-700 bg-gray-800 opacity-60'
              }`}>
                <input
                  type="radio"
                  name="provider"
                  value={p}
                  checked={settings.PROVIDER === p}
                  onChange={(e) => setSettings({ ...settings, PROVIDER: e.target.value })}
                  className="accent-emerald-500"
                />
                <div>
                  <span className="font-medium capitalize">{p}</span>
                  {p === 'twilio' && <span className="text-xs text-gray-500 ml-2">(Coming soon)</span>}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Telnyx config */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Telnyx Configuration</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">API Key</label>
            <input
              type="password"
              value={settings.TELNYX_API_KEY}
              onChange={(e) => setSettings({ ...settings, TELNYX_API_KEY: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="KEY_..."
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Connection ID</label>
            <input
              value={settings.TELNYX_CONNECTION_ID}
              onChange={(e) => setSettings({ ...settings, TELNYX_CONNECTION_ID: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="Connection ID from Telnyx portal"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Phone Number</label>
            <input
              value={settings.TELNYX_PHONE_NUMBER}
              onChange={(e) => setSettings({ ...settings, TELNYX_PHONE_NUMBER: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              placeholder="+16025551234"
            />
          </div>
        </div>

        {/* Webhook */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Webhook</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Webhook Base URL</label>
            <input
              value={settings.WEBHOOK_BASE_URL}
              onChange={(e) => setSettings({ ...settings, WEBHOOK_BASE_URL: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
              placeholder="https://your-domain.com"
            />
            <p className="text-xs text-gray-600 mt-1">
              Public URL where Telnyx sends webhook events. Use ngrok for local dev.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
          >
            {testing ? <Loader size={16} className="animate-spin" /> : null}
            Test Connection
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-emerald-400 text-sm">
              <CheckCircle size={16} /> Saved
            </span>
          )}
        </div>

        {/* Health check result */}
        {health && (
          <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
            health.status === 'configured' ? 'bg-emerald-900/50 text-emerald-300' :
            health.status === 'unconfigured' ? 'bg-yellow-900/50 text-yellow-300' :
            'bg-red-900/50 text-red-300'
          }`}>
            {health.status === 'configured' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {health.message}
          </div>
        )}
      </form>
    </div>
  );
}
