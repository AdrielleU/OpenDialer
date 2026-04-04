import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { User } from '../types';
import { Users, UserPlus, Trash2, KeyRound } from 'lucide-react';

export default function Team() {
  const [users, setUsers] = useState<User[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'operator' });
  const [creating, setCreating] = useState(false);
  const [resetPwUserId, setResetPwUserId] = useState<number | null>(null);
  const [resetPw, setResetPw] = useState('');

  const load = () => {
    api.users.list().then(setUsers).catch(console.error);
  };
  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.users.create(form);
      setShowInvite(false);
      setForm({ email: '', name: '', password: '', role: 'operator' });
      load();
    } catch (err: any) {
      alert(err.message);
    }
    setCreating(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    try {
      await api.users.delete(id);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResetPassword = async (id: number) => {
    if (!resetPw || resetPw.length < 8) {
      alert('Password must be at least 8 characters.');
      return;
    }
    try {
      await api.users.resetPassword(id, resetPw);
      setResetPwUserId(null);
      setResetPw('');
      alert('Password reset. User must change it on next login.');
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users size={24} className="text-emerald-400" />
          <h1 className="text-2xl font-bold">Team</h1>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors"
        >
          <UserPlus size={16} /> Add Member
        </button>
      </div>

      <div className="space-y-2">
        {users.map((user) => (
          <div key={user.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">{user.name}</div>
              <div className="text-sm text-gray-500">{user.email}</div>
              <div className="flex gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  user.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {user.role}
                </span>
                {user.mustChangePassword && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                    Must change password
                  </span>
                )}
                {user.lastLoginAt && (
                  <span className="text-xs text-gray-600">
                    Last login: {new Date(user.lastLoginAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setResetPwUserId(resetPwUserId === user.id ? null : user.id)}
                className="p-2 text-gray-500 hover:text-yellow-400 transition-colors"
                title="Reset password"
              >
                <KeyRound size={16} />
              </button>
              <button
                onClick={() => handleDelete(user.id)}
                className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                title="Delete user"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <div className="text-sm text-gray-600 py-8 text-center">No team members yet.</div>
        )}
      </div>

      {/* Reset password inline form */}
      {resetPwUserId && (
        <div className="mt-4 bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-2">Reset Password for {users.find(u => u.id === resetPwUserId)?.name}</h3>
          <div className="flex gap-2">
            <input
              type="password"
              value={resetPw}
              onChange={(e) => setResetPw(e.target.value)}
              placeholder="New temporary password (min 8)"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={() => handleResetPassword(resetPwUserId)}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm font-medium transition-colors"
            >
              Reset
            </button>
            <button
              onClick={() => { setResetPwUserId(null); setResetPw(''); }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form onSubmit={handleCreate} className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Add Team Member</h2>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                placeholder="operator@company.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                placeholder="Sarah Johnson"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Temporary Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                placeholder="Min 8 characters — they'll change on first login"
                minLength={8}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Role</label>
              <div className="flex gap-4">
                {(['operator', 'admin'] as const).map((r) => (
                  <label key={r} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={form.role === r}
                      onChange={() => setForm({ ...form, role: r })}
                      className="accent-emerald-500"
                    />
                    <span className="text-sm capitalize">{r}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={creating} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
                {creating ? 'Creating...' : 'Add Member'}
              </button>
              <button type="button" onClick={() => setShowInvite(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
