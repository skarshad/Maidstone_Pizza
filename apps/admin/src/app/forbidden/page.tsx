import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'No access' };

export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="rounded-lg border border-ink-900/10 bg-white p-6 shadow-card">
        <h1 className="text-2xl">No access</h1>
        <p className="mt-2 text-sm text-ink-500">
          This screen needs a manager or admin account. You are signed in with an account that does
          not have that access.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button type="submit" className="min-h-11 font-semibold underline underline-offset-2">
            Sign out and use a different account
          </button>
        </form>
      </div>
    </main>
  );
}
