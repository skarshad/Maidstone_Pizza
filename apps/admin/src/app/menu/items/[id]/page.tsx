import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';
import { ItemForm } from '@/components/menu/item-form';
import { ItemImage } from '@/components/menu/item-image';
import { serverApi } from '@/lib/api-server';
import { requireManager } from '@/lib/staff';

export const metadata: Metadata = { title: 'Edit item' };
export const dynamic = 'force-dynamic';

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireManager();
  const { id } = await params;
  const menu = await (await serverApi()).admin.menu();
  const item = menu.categories.flatMap((c) => c.items).find((i) => i.id === id);
  if (!item) notFound();
  return (
    <AdminShell user={user}>
      <h1 className="text-2xl">Edit {item.name}</h1>
      <ItemImage itemId={item.id} itemName={item.name} imageUrl={item.imageUrl} />
      <ItemForm menu={menu} item={item} />
    </AdminShell>
  );
}
