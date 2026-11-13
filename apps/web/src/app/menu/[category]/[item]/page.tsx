import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ItemConfigurator } from '@/components/menu/item-configurator';
import {
  AllergenPanel,
  CategoryNav,
  MenuUnavailable,
  TagBadges,
} from '@/components/menu/menu-parts';
import { getMenu, resolveGroups } from '@/lib/menu';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ category: string; item: string }> };

async function find(params: Props['params']) {
  const { category: categorySlug, item: itemSlug } = await params;
  const menu = await getMenu();
  const category = menu?.categories.find((c) => c.slug === categorySlug);
  const item = category?.items.find((i) => i.slug === itemSlug);
  return { menu, category, item };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { item } = await find(params);
  return item ? { title: item.name, description: item.description } : {};
}

export default async function ItemPage({ params }: Props) {
  const { menu, category, item } = await find(params);
  if (!menu) return <MenuUnavailable />;
  if (!category || !item) notFound();

  return (
    <>
      <CategoryNav menu={menu} current={category.slug} />
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <Link
            href={`/menu/${category.slug}`}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-red-600 underline underline-offset-2"
          >
            Back to {category.name}
          </Link>
          <h1 className="mt-2 text-4xl sm:text-5xl">{item.name}</h1>
          <p className="mt-3 max-w-prose text-lg text-ink-700">{item.description}</p>
          <div className="mt-3">
            <TagBadges item={item} menu={menu} />
          </div>
          <div className="mt-8">
            <ItemConfigurator item={item} groups={resolveGroups(item, menu)} />
          </div>
        </div>
        <aside className="lg:pt-14">
          <AllergenPanel item={item} menu={menu} />
        </aside>
      </div>
    </>
  );
}
