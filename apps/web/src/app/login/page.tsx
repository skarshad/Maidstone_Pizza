import type { Metadata } from 'next';
import { Card } from '@mp/ui';
import { safeNextPath } from '@mp/web-auth/paths';
import { AuthForm } from '@/components/auth-form';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          That sign-in link did not work or has expired. Please try again.
        </p>
      )}
      <Card className="p-6">
        <AuthForm next={safeNextPath(next, '/account')} />
      </Card>
    </div>
  );
}
