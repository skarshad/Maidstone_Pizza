'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { buttonClasses } from '@mp/ui';
import { supabaseBrowser } from '@/lib/supabase-browser';

const inputClass =
  'mt-1 block min-h-12 w-full rounded-md border px-3 text-base border-kitchen-border bg-kitchen-bg text-kitchen-text';

export function StaffLoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      setError('Email or password is incorrect.');
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <label className="block text-sm font-semibold">
        Email
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="block text-sm font-semibold">
        Password
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </label>
      {error && (
        <p role="alert" className="rounded-md px-3 py-2 text-sm bg-kitchen-bg text-kitchen-red">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={`w-full ${buttonClasses('primary', 'lg')}`}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
