'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@mp/api-client';
import type { KitchenOrder } from '@mp/validation';
import { Ticket, type TicketActions } from '@/components/ticket';
import { browserApi } from '@/lib/api-browser';
import { COLUMNS, historyOf, needsAlarm, ticketsFor, timeOfDay } from '@/lib/board';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { useAlarm, useWakeLock } from '@/lib/use-kitchen-extras';

// The live order board.
//
// It must never silently miss an order, so it does not rely on any one thing:
//   1. A Realtime ping asks it to refresh the moment an order changes.
//   2. It also refreshes on a timer (every 15 seconds; every 5 while the live
//      connection is down), so a lost ping only costs seconds.
//   3. It refreshes whenever the live connection comes back, the tab becomes
//      visible, or the device comes back online.
// Every refresh fetches the whole board, so nothing depends on having seen
// every individual change.

const POLL_LIVE_MS = 15_000;
const POLL_DEGRADED_MS = 5_000;

export function KitchenBoard({
  userEmail,
  allergenNames,
}: {
  userEmail: string | null;
  allergenNames: Record<string, string>;
}) {
  const api = useMemo(() => browserApi(), []);
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lastOk, setLastOk] = useState<Date | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [live, setLive] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const board = await api.kitchen.board();
      setOrders(board.orders);
      // Count down from the server's clock, so a wrong tablet clock cannot mislead.
      setClockOffset(new Date(board.serverTime).getTime() - Date.now());
      setLastOk(new Date());
      setFetchFailed(false);
      setLoaded(true);
    } catch (error) {
      setFetchFailed(true);
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        window.location.assign('/login');
      }
    } finally {
      refreshing.current = false;
    }
  }, [api]);

  // 2. Timer. Faster while the live connection is down or a fetch has failed.
  useEffect(() => {
    void refresh();
    const timer = setInterval(
      () => void refresh(),
      live && !fetchFailed ? POLL_LIVE_MS : POLL_DEGRADED_MS,
    );
    return () => clearInterval(timer);
  }, [refresh, live, fetchFailed]);

  // 1 and 3. Realtime ping, and a full refresh every time the connection (re)joins.
  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;
    const channel = supabase.channel('kitchen:orders', { config: { private: true } });

    void (async () => {
      await supabase.realtime.setAuth(); // private channels need the staff token
      if (cancelled) return;
      channel
        .on('broadcast', { event: 'order_changed' }, () => void refresh())
        .subscribe((status) => {
          const joined = status === 'SUBSCRIBED';
          setLive(joined);
          if (joined) void refresh();
        });
    })();

    // Keep the socket's token fresh when the session renews.
    const { data: auth } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      cancelled = true;
      auth.subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  // 3. Coming back to the tab or back online.
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('online', again);
    return () => {
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('online', again);
    };
  }, [refresh]);

  // The clock for countdowns.
  useEffect(() => {
    const tick = () => setNow(new Date(Date.now() + clockOffset));
    tick();
    const timer = setInterval(tick, 10_000);
    return () => clearInterval(timer);
  }, [clockOffset]);

  const alarm = useAlarm(needsAlarm(orders));
  const awake = useWakeLock();
  const newCount = orders.filter((o) => o.status === 'RECEIVED').length;
  const history = historyOf(orders);

  const run = useCallback(
    async (order: KitchenOrder, work: () => Promise<unknown>) => {
      setBusyId(order.id);
      setMessage(null);
      try {
        await work();
      } catch (error) {
        setMessage(
          error instanceof ApiError
            ? `Order #${order.orderNumber}: ${error.message}`
            : `Order #${order.orderNumber}: could not reach the server. Nothing was changed; try again.`,
        );
      } finally {
        await refresh();
        setBusyId(null);
      }
    },
    [refresh],
  );

  const actions: TicketActions = useMemo(
    () => ({
      accept: (order, prepMinutes) =>
        void run(order, () => api.kitchen.accept(order.id, prepMinutes)),
      reject: (order, reason) =>
        void run(order, async () => {
          const result = await api.kitchen.reject(order.id, reason);
          if (result.refund === 'needs_review') {
            setMessage(
              `Order #${order.orderNumber} was rejected, but the refund could not be made automatically. Tell a manager.`,
            );
          }
        }),
      move: (order, moves) =>
        void run(order, async () => {
          for (const to of moves) await api.kitchen.setStatus(order.id, to);
        }),
      toggleItem: (order, itemId, done) => {
        // Show the tick at once; the next refresh confirms it.
        setOrders((current) =>
          current.map((o) =>
            o.id === order.id
              ? { ...o, items: o.items.map((i) => (i.id === itemId ? { ...i, done } : i)) }
              : o,
          ),
        );
        void api.kitchen.setItemDone(order.id, itemId, done).catch(() => void refresh());
      },
    }),
    [api, run, refresh],
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-kitchen-border px-4 py-2">
        <div className="flex items-center gap-4">
          <p className="text-2xl font-black">Kitchen</p>
          <p
            role="status"
            className={
              'rounded-full px-3 py-1 text-sm font-bold ' +
              (fetchFailed
                ? 'bg-kitchen-red text-black'
                : live
                  ? 'bg-kitchen-green text-black'
                  : 'bg-kitchen-amber text-black')
            }
          >
            {fetchFailed ? 'OFFLINE' : live ? 'LIVE' : 'CHECKING EVERY 5s'}
          </p>
          {!awake && <p className="text-sm text-kitchen-muted">Screen may sleep</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!alarm.enabled && (
            <button
              type="button"
              onClick={() => void alarm.enable()}
              className="min-h-12 rounded-xl bg-kitchen-amber px-4 font-bold text-black"
            >
              Enable sound
            </button>
          )}
          <button
            type="button"
            aria-pressed={showHistory}
            onClick={() => setShowHistory((v) => !v)}
            className="min-h-12 rounded-xl border-2 border-kitchen-border px-4 font-bold"
          >
            History ({history.length})
          </button>
          <form action="/auth/signout" method="post" className="flex items-center gap-3">
            <span className="text-sm text-kitchen-muted">{userEmail}</span>
            <button type="submit" className="min-h-12 font-semibold underline underline-offset-2">
              Sign out
            </button>
          </form>
        </div>
      </header>

      {fetchFailed && (
        <p role="alert" className="bg-kitchen-red px-4 py-3 text-lg font-black text-black">
          OFFLINE. New orders are NOT showing.{' '}
          {lastOk
            ? `Last updated ${timeOfDay(lastOk.toISOString())}.`
            : 'The board has not loaded yet.'}{' '}
          Check the internet connection. Retrying every 5 seconds.
        </p>
      )}
      {!alarm.enabled && newCount > 0 && (
        <p role="alert" className="bg-kitchen-amber px-4 py-3 text-lg font-black text-black">
          {newCount} NEW {newCount === 1 ? 'ORDER' : 'ORDERS'} WAITING. Sound is off: press
          &ldquo;Enable sound&rdquo;.
        </p>
      )}
      {message && (
        <p
          role="alert"
          className="flex items-center justify-between gap-3 bg-white px-4 py-3 font-bold text-black"
        >
          {message}
          <button type="button" className="min-h-11 underline" onClick={() => setMessage(null)}>
            Dismiss
          </button>
        </p>
      )}

      <main className="flex-1 p-3">
        {showHistory ? (
          <section aria-labelledby="history-heading">
            <h1 id="history-heading" className="text-2xl font-black">
              Finished in the last 3 hours
            </h1>
            {history.length === 0 ? (
              <p className="mt-3 text-kitchen-muted">Nothing finished yet.</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {history.map((order) => (
                  <Ticket
                    key={order.id}
                    order={order}
                    now={now}
                    allergenNames={allergenNames}
                    busy={false}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <h1 className="sr-only">Order board</h1>
            {COLUMNS.map((column) => {
              const tickets = ticketsFor(orders, column.key);
              return (
                <section key={column.key} aria-labelledby={`col-${column.key}`}>
                  <h2
                    id={`col-${column.key}`}
                    className="flex items-center justify-between border-b-4 border-kitchen-border pb-2 text-xl font-black"
                  >
                    {column.title}
                    <span className="rounded-full bg-white px-3 text-black tabular-nums">
                      {tickets.length}
                    </span>
                  </h2>
                  <div className="mt-3 space-y-3">
                    {tickets.map((order) => (
                      <Ticket
                        key={order.id}
                        order={order}
                        now={now}
                        allergenNames={allergenNames}
                        actions={actions}
                        busy={busyId === order.id}
                      />
                    ))}
                    {tickets.length === 0 && (
                      <p className="p-4 text-center text-kitchen-muted">
                        {loaded ? 'None' : 'Loading…'}
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
