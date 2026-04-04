import { useState, useEffect } from 'react';
import { auth } from '../lib/api';
import { Phone, Lock, Shield, Eye, EyeOff } from 'lucide-react';

type Stage = 'loading' | 'login' | 'mfa';

interface Props {
  onAuthenticated: () => void;
}

export default function Login({ onAuthenticated }: Props) {
  const [stage, setStage] = useState<Stage>('loading');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasWorkos, setHasWorkos] = useState(false);

  useEffect(() => {
    auth.status().then((res) => {
      if (res.loggedIn) {
        onAuthenticated();
      } else {
        setHasWorkos(res.hasWorkos);
        setStage('login');
      }
    }).catch(() => setStage('login'));
  }, [onAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await auth.login(password);
      if (res.requireMfa) {
        setStage('mfa');
      } else {
        onAuthenticated();
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await auth.loginMfa(password, mfaCode);
      onAuthenticated();
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  if (stage === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-2xl font-bold text-emerald-400">
            <Phone size={28} />
            OpenDialer
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          {stage === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Lock size={18} className="text-emerald-400" />
                <h2 className="font-semibold">Sign In</h2>
              </div>
              <div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm pr-10"
                    placeholder="Password"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || !password}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              {hasWorkos && (
                <>
                  <div className="relative my-3">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-800" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-gray-900 px-2 text-gray-500">or</span>
                    </div>
                  </div>
                  <a
                    href="/api/auth/workos"
                    className="block w-full py-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium text-center transition-colors"
                  >
                    Sign in with SSO
                  </a>
                </>
              )}
            </form>
          )}

          {stage === 'mfa' && (
            <form onSubmit={handleMfa} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={18} className="text-emerald-400" />
                <h2 className="font-semibold">Two-Factor Authentication</h2>
              </div>
              <p className="text-sm text-gray-400">
                Enter the 6-digit code from your authenticator app.
              </p>
              <input
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-center tracking-widest text-lg font-mono"
                placeholder="000000"
                maxLength={6}
                required
                autoFocus
              />
              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
              <button
                type="button"
                onClick={() => { setStage('login'); setMfaCode(''); setError(''); }}
                className="w-full text-sm text-gray-500 hover:text-gray-300"
              >
                Back
              </button>
            </form>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
