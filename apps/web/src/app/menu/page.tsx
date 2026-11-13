import { redirect } from 'next/navigation';
import { MenuUnavailable } from '@/components/menu/menu-parts';
import { getMenu } from '@/lib/menu';

// Rendered per request: the menu comes from the API, which is not available at build time.
export const dynamic = 'force-dynamic';

export default async function MenuIndex() {
  const menu = await getMenu();
  const first = menu?.categories[0];
  if (!first) return <MenuUnavailable />;
  redirect(`/menu/${first.slug}`);
}
