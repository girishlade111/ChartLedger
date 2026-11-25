import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

export type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

interface AuthViewsProps {
  mode: AuthMode;
  onChangeMode: (mode: AuthMode) => void;
  onBackHome: () => void;
  onSuccess: () => void;
}

export function AuthViews({ mode, onChangeMode, onBackHome, onSuccess }: AuthViewsProps) {
  const { loginWithEmail, registerWithEmail, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
        onSuccess();
      } else if (mode === 'register') {
        if (!acceptedTerms) {
          setError('Please accept the Terms of Service and Financial Risk Disclosure.');
          setSubmitting(false);
          return;
        }
        await registerWithEmail({ email, password, displayName, acceptedTerms });
        onSuccess();
      } else if (mode === 'forgot') {
        const res = await apiFetch<{ message: string; devResetToken?: string }>(
          '/api/auth/forgot-password',
          {
            method: 'POST',
            body: JSON.stringify({ email }),
          }
        );
        setInfo(
          res.devResetToken
            ? `${res.message} Local dev reset token: ${res.devResetToken}`
            : res.message
        );
        if (res.devResetToken) setResetToken(res.devResetToken);
      } else if (mode === 'reset') {
        const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: resetToken, newPassword }),
        });
        setInfo(res.message);
        onChangeMode('login');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle();
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Google Sign-In did not complete.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-zinc-50 px-6 py-12 dark:bg-[#09090B]">
      <div className="mx-auto w-full max-w-md space-y-6">
        <button
          type="button"
          onClick={onBackHome}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to ChartLedger
        </button>

        <div className="rounded-xl border border-zinc-200 bg-white p-7 dark:border-zinc-800 dark:bg-[#111114]">
          <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
            {mode === 'login'
              ? 'Sign in to ChartLedger'
              : mode === 'register'
                ? 'Create your research account'
                : mode === 'forgot'
                  ? 'Reset your password'
                  : 'Set a new password'}
          </h1>
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            {mode === 'login'
              ? 'Access your chart analyses, streaming research chats, and private knowledge base.'
              : mode === 'register'
                ? 'Free plan includes 15 structured chart analyses and 75 AI research messages per month.'
                : 'Account recovery with secure token verification.'}
          </p>

          {(mode === 'login' || mode === 'register') && (
            <div className="mt-5">
              <button
                type="button"
                disabled={submitting}
                onClick={handleGoogle}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Continue with Google
              </button>
              <div className="my-5 flex items-center gap-3 text-xs text-zinc-400">
                <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                <span>or with email</span>
                <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label htmlFor="auth-name" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Display Name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex Morgan"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-[#09090B] dark:text-zinc-50"
                />
              </div>
            )}

            {mode !== 'reset' && (
              <div>
                <label htmlFor="auth-email" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Email Address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="trader@example.com"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-[#09090B] dark:text-zinc-50"
                />
              </div>
            )}

            {(mode === 'login' || mode === 'register') && (
              <div>
                <label htmlFor="auth-password" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Password {mode === 'register' ? '(min 8 characters)' : ''}
                </label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={mode === 'register' ? 8 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-[#09090B] dark:text-zinc-50"
                />
              </div>
            )}

            {mode === 'reset' && (
              <>
                <div>
                  <label htmlFor="reset-token" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Reset Token
                  </label>
                  <input
                    id="reset-token"
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-[#09090B]"
                  />
                </div>
                <div>
                  <label htmlFor="reset-password" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    New Password (min 8 characters)
                  </label>
                  <input
                    id="reset-password"
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-[#09090B]"
                  />
                </div>
              </>
            )}

            {mode === 'register' && (
              <label className="flex items-start gap-2.5 text-xs text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 rounded border-zinc-300 dark:border-zinc-700"
                />
                <span>
                  I accept the Terms of Service, Privacy Policy, and acknowledge that ChartLedger
                  provides educational research only (not financial advice).
                </span>
              </label>
            )}

            {error && (
              <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            {info && (
              <p className="break-all rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {submitting
                ? 'Please wait...'
                : mode === 'login'
                  ? 'Sign In'
                  : mode === 'register'
                    ? 'Create Account'
                    : mode === 'forgot'
                      ? 'Request Reset Token'
                      : 'Update Password'}
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
            {mode === 'login' ? (
              <>
                <button
                  type="button"
                  onClick={() => onChangeMode('register')}
                  className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  Create an account
                </button>
                <button
                  type="button"
                  onClick={() => onChangeMode('forgot')}
                  className="hover:underline"
                >
                  Forgot password?
                </button>
              </>
            ) : mode === 'forgot' ? (
              <>
                <button type="button" onClick={() => onChangeMode('login')} className="hover:underline">
                  Back to Sign In
                </button>
                <button
                  type="button"
                  onClick={() => onChangeMode('reset')}
                  className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  Have a reset token?
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onChangeMode('login')}
                className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Already have an account? Sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface OnboardingModalProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingModalProps) {
  const { setUser } = useAuth();
  const [experience, setExperience] = useState<'Beginner' | 'Intermediate' | 'Experienced'>('Intermediate');
  const [researchStyle, setResearchStyle] = useState<'Scalping' | 'Intraday' | 'Swing' | 'Position / Long-Term'>('Swing');
  const [detailLevel, setDetailLevel] = useState<'Concise' | 'Balanced' | 'Comprehensive'>('Balanced');
  const [preferredMarkets, setPreferredMarkets] = useState<string[]>(['Crypto', 'Forex']);
  const [preferredTimeframes, setPreferredTimeframes] = useState<string[]>(['1H', '4H', '1D']);
  const [language, setLanguage] = useState('English');
  const [saving, setSaving] = useState(false);

  const toggleItem = (list: string[], value: string, setter: (v: string[]) => void) => {
    setter(list.includes(value) ? list.filter((i) => i !== value) : [...list, value]);
  };

  const handleSave = async (skip = false) => {
    setSaving(true);
    try {
      const payload = skip
        ? { onboardingCompleted: true }
        : {
            experience,
            researchStyle,
            detailLevel,
            preferredMarkets,
            preferredTimeframes,
            language,
            personalizationEnabled: true,
            onboardingCompleted: true,
          };
      const res = await apiFetch<{ onboardingCompleted: boolean; preferencesJson: Record<string, unknown> }>(
        '/api/user/preferences',
        { method: 'PATCH', body: JSON.stringify(payload) }
      );
      setUser((prev) =>
        prev
          ? {
              ...prev,
              onboardingCompleted: res.onboardingCompleted,
              preferencesJson: res.preferencesJson,
            }
          : prev
      );
      onComplete();
    } catch {
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12 dark:bg-[#09090B]">
      <div className="w-full max-w-2xl space-y-6 rounded-xl border border-zinc-200 bg-white p-7 dark:border-zinc-800 dark:bg-[#111114]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold">Configure Research Preferences</h1>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Optional personalization adjusts explanation depth and terminology. You can skip or
              change these settings anytime.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave(true)}
            className="whitespace-nowrap text-xs font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-100"
          >
            Skip for now
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="ob-exp" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Trading Experience
            </label>
            <select
              id="ob-exp"
              value={experience}
              onChange={(e) => setExperience(e.target.value as any)}
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-[#09090B]"
            >
              <option value="Beginner">Beginner (plain-language definitions)</option>
              <option value="Intermediate">Intermediate (balanced structure & risk)</option>
              <option value="Experienced">Experienced (concise market structure)</option>
            </select>
          </div>

          <div>
            <label htmlFor="ob-style" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Research Style
            </label>
            <select
              id="ob-style"
              value={researchStyle}
              onChange={(e) => setResearchStyle(e.target.value as any)}
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-[#09090B]"
            >
              <option value="Scalping">Scalping</option>
              <option value="Intraday">Intraday</option>
              <option value="Swing">Swing</option>
              <option value="Position / Long-Term">Position / Long-Term</option>
            </select>
          </div>

          <div>
            <label htmlFor="ob-detail" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Analysis Detail
            </label>
            <select
              id="ob-detail"
              value={detailLevel}
              onChange={(e) => setDetailLevel(e.target.value as any)}
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-[#09090B]"
            >
              <option value="Concise">Concise</option>
              <option value="Balanced">Balanced</option>
              <option value="Comprehensive">Comprehensive</option>
            </select>
          </div>

          <div>
            <label htmlFor="ob-lang" className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Preferred Response Language
            </label>
            <select
              id="ob-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-[#09090B]"
            >
              <option>English</option>
              <option>Hindi</option>
              <option>Marathi</option>
              <option>Spanish</option>
              <option>French</option>
              <option>German</option>
              <option>Italian</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Preferred Markets
          </div>
          <div className="flex flex-wrap gap-2">
            {['Forex', 'Crypto', 'Stocks', 'Indices', 'Commodities'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => toggleItem(preferredMarkets, m, setPreferredMarkets)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  preferredMarkets.includes(m)
                    ? 'border-emerald-500 bg-emerald-600 text-white'
                    : 'border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Preferred Timeframes
          </div>
          <div className="flex flex-wrap gap-2">
            {['5M', '15M', '1H', '4H', '1D', '1W'].map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => toggleItem(preferredTimeframes, tf, setPreferredTimeframes)}
                className={`rounded-md border px-3 py-1.5 font-mono text-xs font-medium transition-colors ${
                  preferredTimeframes.includes(tf)
                    ? 'border-emerald-500 bg-emerald-600 text-white'
                    : 'border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave(false)}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Preferences & Enter Workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}
