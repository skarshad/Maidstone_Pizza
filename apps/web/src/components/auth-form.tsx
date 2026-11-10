'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@mp/ui';
import { supabaseBrowser } from '@/lib/supabase-browser';

type Mode = 'sign-in' | 'sign-up' | 'magic-link' | 'reset';

const titles: Record<Mode, string> = {
  'sign-in': 'Sign in',
  'sign-up': 'Create your account',
  'magic-link': 'Email me a sign-in link',
  reset: 'Reset your password',
};

const providers = [
  { id: 'google', label: 'Continue with Google' },
  { id: 'apple', label: 'Continue with Apple' },
  { id: 'facebook', label: 'Continue with Facebook' },
] as const;

const inputClass =
  'mt-1 block min-h-12 w-full rounded-md border border-ink-300 bg-white px-3 text-base text-ink-900 placeholder:text-ink-500';

export function AuthForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const callbackUrl = (path: string) =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(path)}`;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = supabaseBrowser();
    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
        return;
      }
      if (mode === 'sign-up') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callbackUrl(next) },
        });
        if (error) throw error;
        if (data.session) {
          router.replace(next);
          router.refresh();
          return;
        }
        setNotice('Check your email to confirm your address, then you can sign in.');
      }
      if (mode === 'magic-link') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: callbackUrl(next) },
        });
        if (error) throw error;
        setNotice('If that address can sign in, a link is on its way. Open it on this device.');
      }
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: callbackUrl('/account/update-password'),
        });
        if (error) throw error;
        setNotice('If we have an account for that address, a reset link is on its way.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function onProvider(provider: (typeof providers)[number]['id']) {
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl(next) },
    });
    if (error) setError(error.message);
  }

  const needsPassword = mode === 'sign-in' || mode === 'sign-up';

  return (
    <div>
      <h1 className="text-3xl">{titles[mode]}</h1>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate={false}>
        <label className="block text-sm font-semibold">
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        {needsPassword && (
          <label className="block text-sm font-semibold">
            Password
            <input
              type="password"
              name="password"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            {mode === 'sign-up' && (
              <span className="mt-1 block text-xs font-normal text-ink-500">
                At least 8 characters.
              </span>
            )}
          </label>
        )}

        <div aria-live="polite">
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>
          )}
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Please wait…' : titles[mode]}
        </Button>
      </form>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {(Object.keys(titles) as Mode[])
          .filter((m) => m !== mode)
          .map((m) => (
            <li key={m}>
              <button
                type="button"
                className="min-h-11 font-semibold text-red-500 underline underline-offset-2"
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setNotice(null);
                }}
              >
                {titles[m]}
              </button>
            </li>
          ))}
      </ul>

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-ink-500">
        <span className="h-px flex-1 bg-ink-300" />
        or
        <span className="h-px flex-1 bg-ink-300" />
      </div>

      <div className="space-y-3">
        {providers.map((p) => (
          <Button key={p.id} variant="outline" className="w-full" onClick={() => onProvider(p.id)}>
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
