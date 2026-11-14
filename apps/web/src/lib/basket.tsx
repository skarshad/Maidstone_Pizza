'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { MAX_BASKET_LINES, MAX_LINE_QUANTITY, type BasketLineInput } from '@mp/pricing';

// The basket lives in this browser only (localStorage) and holds choices, never
// prices: every price shown is worked out from the current menu, and the server
// works it out again at checkout.

const STORAGE_KEY = 'mp.basket.v1';

export interface StoredLine extends BasketLineInput {
  /** Stable id for this line in the list. */
  key: string;
  notes: string;
}

interface BasketContextValue {
  lines: StoredLine[];
  /** False until the saved basket has been read (avoids a flash of "empty"). */
  ready: boolean;
  itemCount: number;
  add(line: BasketLineInput): void;
  setQuantity(key: string, quantity: number): void;
  remove(key: string): void;
  clear(): void;
}

const BasketContext = createContext<BasketContextValue | null>(null);

function sameChoices(a: BasketLineInput, b: BasketLineInput): boolean {
  const flat = (line: BasketLineInput) =>
    JSON.stringify([
      line.itemId,
      line.variantId,
      (line.notes ?? '').trim(),
      [...line.selections]
        .filter((s) => s.optionIds.length > 0)
        .sort((x, y) => x.groupId.localeCompare(y.groupId))
        .map((s) => [s.groupId, [...s.optionIds].sort()]),
    ]);
  return flat(a) === flat(b);
}

function read(): StoredLine[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    // Anything malformed is dropped; the server validates every line anyway.
    return parsed.filter(
      (l): l is StoredLine =>
        typeof l === 'object' &&
        l !== null &&
        typeof l.key === 'string' &&
        typeof l.itemId === 'string' &&
        typeof l.variantId === 'string' &&
        Number.isInteger(l.quantity) &&
        Array.isArray(l.selections),
    );
  } catch {
    return [];
  }
}

export function BasketProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<StoredLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLines(read());
    setReady(true);
    // Keep several open tabs in step.
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setLines(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((change: (current: StoredLine[]) => StoredLine[]) => {
    setLines((current) => {
      const next = change(current);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Private browsing or full storage: the basket still works for this visit.
      }
      return next;
    });
  }, []);

  const value = useMemo<BasketContextValue>(
    () => ({
      lines,
      ready,
      itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
      add(line) {
        update((current) => {
          const existing = current.find((l) => sameChoices(l, line));
          if (existing) {
            return current.map((l) =>
              l === existing
                ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, l.quantity + line.quantity) }
                : l,
            );
          }
          if (current.length >= MAX_BASKET_LINES) return current;
          return [
            ...current,
            { ...line, notes: (line.notes ?? '').trim(), key: crypto.randomUUID() },
          ];
        });
      },
      setQuantity(key, quantity) {
        update((current) =>
          quantity < 1
            ? current.filter((l) => l.key !== key)
            : current.map((l) =>
                l.key === key ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, quantity) } : l,
              ),
        );
      },
      remove(key) {
        update((current) => current.filter((l) => l.key !== key));
      },
      clear() {
        update(() => []);
      },
    }),
    [lines, ready, update],
  );

  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

export function useBasket(): BasketContextValue {
  const value = useContext(BasketContext);
  if (!value) throw new Error('useBasket must be used inside <BasketProvider>');
  return value;
}
