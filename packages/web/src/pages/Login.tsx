import { useState, useEffect } from 'react';
import { auth } from '../lib/api';
import { Phone, Lock, Shield, Eye, EyeOff, KeyRound } from 'lucide-react';

type Stage = 'loading' | 'login' | 'mfa' | 'change_password' | 'mfa_setup' | 'mfa_verify';

interface Props {
  onAuthenticated: () => void;
}

export default function Login({ onAuthenticated }: Props) {
  const [stage, setStage] = useState<Stage>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasWorkos, setHasWorkos] = useState(false);

  useEffect(() => {
    auth.status().then((res) => {
      if (res.loggedIn) {
        // Check if setup is needed
        if (res.user?.mustChangePassword) {
          setStage('change_password');
        } else if (res.user?.mustSetupMfa) {
          setStage('mfa_setup');
        } else {
          onAuthenticated();
        }
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
      const res = await auth.login(email, password);
      if (res.requirePasswordChange) {
        setStage('change_password');
      } else if (res.requireMfaSetup) {
        // Load QR code
        const mfa = await auth.mfaSetup();
        setQrCode(mfa.qrCode);
        setMfaSecret(mfa.secret);
        setStage('mfa_setup');
      } else if (res.requireMfa) {
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
      await auth.loginMfa(email, password, mfaCode);
      onAuthenticated();
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await auth.changePassword(password, newPassword);
      // Check if MFA setup is also needed
      const status = await auth.status();
      if (status.user?.mustSetupMfa) {
        const mfa = await auth.mfaSetup();
        setQrCode(mfa.qrCode);
        setMfaSecret(mfa.secret);
        setStage('mfa_setup');
      } else {
        onAuthenticated();
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleMfaSetup = async () => {
    if (!qrCode) {
      try {
        const mfa = await auth.mfaSetup();
        setQrCode(mfa.qrCode);
        setMfaSecret(mfa.secret);
      } catch (err: any) {
        setError(err.message);
      }
    }
    setStage('mfa_verify');
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await auth.verifyMfa(mfaCode);
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
          {/* Login */}
          {stage === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Lock size={18} className="text-emerald-400" />
                <h2 className="font-semibold">Sign In</h2>
              </div>
              <div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="Email"
                  required
                  autoFocus
                />
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm pr-10"
                  placeholder="Password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button
                type="submit"
                disabled={loading || !email || !password}
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

          {/* MFA */}
          {stage === 'mfa' && (
            <form onSubmit={handleMfa} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={18} className="text-emerald-400" />
                <h2 className="font-semibold">Two-Factor Authentication</h2>
              </div>
              <p className="text-sm text-gray-400">Enter the 6-digit code from your authenticator app.</p>
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
              <button type="button" onClick={() => { setStage('login'); setMfaCode(''); setError(''); }} className="w-full text-sm text-gray-500 hover:text-gray-300">Back</button>
            </form>
          )}

          {/* Change Password */}
          {stage === 'change_password' && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <KeyRound size={18} className="text-emerald-400" />
                <h2 className="font-semibold">Change Your Password</h2>
              </div>
              <p className="text-sm text-gray-400">You must change your password before continuing.</p>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm"
                placeholder="New password (min 8 characters)"
                minLength={8}
                required
                autoFocus
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm"
                placeholder="Confirm new password"
                required
              />
              <button
                type="submit"
                disabled={loading || newPassword.length < 8 || newPassword !== confirmPassword}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {loading ? 'Saving...' : 'Set New Password'}
              </button>
            </form>
          )}

          {/* MFA Setup */}
          {stage === 'mfa_setup' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={18} className="text-emerald-400" />
                <h2 className="font-semibold">Set Up Two-Factor Auth</h2>
              </div>
              <p className="text-sm text-gray-400">
                Two-factor authentication is required. Scan this QR code with your authenticator app.
              </p>
              {qrCode && (
                <div className="flex justify-center bg-white rounded-lg p-4">
                  <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />
                </div>
              )}
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer hover:text-gray-400">Can't scan? Enter manually</summary>
                <code className="block mt-2 p-2 bg-gray-800 rounded text-gray-300 break-all select-all">{mfaSecret}</code>
              </details>
              <button
                onClick={handleMfaSetup}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors"
              >
                I've scanned it — verify
              </button>
            </div>
          )}

          {/* MFA Verify (during setup) */}
          {stage === 'mfa_verify' && (
            <form onSubmit={handleMfaVerify} className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={18} className="text-emerald-400" />
                <h2 className="font-semibold">Verify Your Code</h2>
              </div>
              <p className="text-sm text-gray-400">Enter the 6-digit code from your authenticator app to confirm setup.</p>
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
                {loading ? 'Verifying...' : 'Verify & Complete Setup'}
              </button>
              <button type="button" onClick={() => setStage('mfa_setup')} className="w-full text-sm text-gray-500 hover:text-gray-300">Back to QR code</button>
            </form>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-900/50 border border-red-800 rounded-lg text-red-300 text-sm">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
