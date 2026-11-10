import type { Metadata } from 'next';
import Image from 'next/image';
import { safeNextPath } from '@mp/web-auth/paths';
import { StaffLoginForm } from '@/components/staff-login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="rounded-lg border border-ink-900/10 bg-white p-6 shadow-card">
        <Image
          src="/brand/logo.png"
          alt=""
          width={72}
          height={72}
          priority
          className="rounded-full"
        />
        <h1 className="mt-4 text-2xl">Maidstone Pizza Admin</h1>
        <p className="mt-1 text-sm text-ink-500">Staff sign-in. Ask an admin if you need access.</p>
        <StaffLoginForm next={safeNextPath(next, '/')} />
      </div>
    </main>
  );
}
