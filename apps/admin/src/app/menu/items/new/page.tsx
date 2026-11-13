import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin-shell';
import { ItemForm } from '@/components/menu/item-form';
import { serverApi } from '@/lib/api-server';
import { requireManager } from '@/lib/staff';

export const metadata: Metadata = { title: 'Add an item' };
export const dynamic = 'force-dynamic';

export default async function NewItemPage() {
  const user = await requireManager();
  const menu = await (await serverApi()).admin.menu();
  return (
    <AdminShell user={user}>
      <h1 className="text-2xl">Add an item</h1>
      <ItemForm menu={menu} />
    </AdminShell>
  );
}
