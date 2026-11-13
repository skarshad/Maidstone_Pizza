import { cache } from 'react';
import { menuSchema, type Menu, type MenuItem, type MenuOptionGroup } from '@mp/validation';
import { env } from '@/env';

/**
 * The published menu from the API, or null if it cannot be reached.
 * Deduplicated per request; the API response is reused for up to a minute.
 */
export const getMenu = cache(async (): Promise<Menu | null> => {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/v1/menu`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return menuSchema.parse(await res.json());
  } catch {
    return null;
  }
});

export function lowestPrice(item: MenuItem): number {
  return Math.min(...item.variants.map((v) => v.pricePence));
}

export interface ResolvedGroup {
  group: MenuOptionGroup;
  minSelect: number;
  maxSelect: number | null;
  freeSelect: number;
}

/** The option groups that apply to an item, with the item's own limits applied. */
export function resolveGroups(item: MenuItem, menu: Menu): ResolvedGroup[] {
  return item.optionGroups.flatMap((ref) => {
    const group = menu.optionGroups.find((g) => g.id === ref.groupId);
    if (!group || group.options.length === 0) return [];
    return [
      {
        group,
        minSelect: group.minSelect,
        maxSelect: ref.maxSelect ?? group.maxSelect,
        freeSelect: ref.freeSelect,
      },
    ];
  });
}
