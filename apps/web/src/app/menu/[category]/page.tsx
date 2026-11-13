import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryNav, ItemCard, MenuUnavailable } from '@/components/menu/menu-parts';
import { getMenu } from '@/lib/menu';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params;
  const category = (await getMenu())?.categories.find((c) => c.slug === slug);
  return category ? { title: category.name } : {};
}

export default async function CategoryPage({ params }: Props) {
  const { category: slug } = await params;
  const menu = await getMenu();
  if (!menu) return <MenuUnavailable />;
  const category = menu.categories.find((c) => c.slug === slug);
  if (!category) notFound();

  return (
    <>
      <CategoryNav menu={menu} current={category.slug} />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-4xl sm:text-5xl">{category.name}</h1>
        {category.description && (
          <p className="mt-2 max-w-prose text-ink-700">{category.description}</p>
        )}
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {category.items.map((item) => (
            <ItemCard key={item.id} item={item} category={category} menu={menu} />
          ))}
        </ul>
        <p className="mt-8 text-sm text-ink-700">
          Food allergy or intolerance? Open an item to see its allergen information, or contact the
          shop before ordering.
        </p>
      </div>
    </>
  );
}
