'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Card } from '@mp/ui';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace('/account');
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card className="p-6">
        <h1 className="text-3xl">Choose a new password</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold">
            New password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block min-h-12 w-full rounded-md border border-ink-300 bg-white px-3 text-base"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Saving…' : 'Save password'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
