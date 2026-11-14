'use client';

import Link from 'next/link';
import { buttonClasses } from '@mp/ui';
import { useBasket } from '@/lib/basket';

/** Header link to the basket, with the number of items once the basket has loaded. */
export function BasketLink() {
  const { itemCount, ready } = useBasket();
  const count = ready ? itemCount : 0;
  return (
    <Link href="/basket" className={buttonClasses('primary')}>
      Basket
      {count > 0 && (
        <span className="rounded-full bg-white px-2 text-sm font-bold tabular-nums text-red-700">
          {count}
          <span className="sr-only"> {count === 1 ? 'item' : 'items'}</span>
        </span>
      )}
    </Link>
  );
}
