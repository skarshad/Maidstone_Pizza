'use client';

import { useState } from 'react';
import type { KitchenOrder } from '@mp/validation';
import {
  CHANNEL_LABEL,
  FINISHED_LABEL,
  PREP_CHOICES,
  REJECT_REASONS,
  allergenFlags,
  columnOf,
  countdown,
  nextAction,
  timeOfDay,
  urgency,
  waiting,
  type NextStatus,
} from '@/lib/board';

export interface TicketActions {
  accept(order: KitchenOrder, prepMinutes: number): void;
  reject(order: KitchenOrder, reason: string): void;
  move(order: KitchenOrder, moves: NextStatus[]): void;
  toggleItem(order: KitchenOrder, itemId: string, done: boolean): void;
}

const bigButton =
  'min-h-14 rounded-xl px-4 text-lg font-bold disabled:opacity-50 ' +
  'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2';

const URGENCY_BORDER = {
  ok: 'border-kitchen-border',
  soon: 'border-kitchen-amber',
  late: 'border-kitchen-red',
} as const;

export function Ticket({
  order,
  now,
  allergenNames,
  actions,
  busy,
}: {
  order: KitchenOrder;
  now: Date;
  allergenNames: Record<string, string>;
  /** Omit for a read-only ticket (history). */
  actions?: TicketActions;
  busy: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const column = columnOf(order);
  const level = urgency(order, now);
  const next = nextAction(order);
  const isNew = order.status === 'RECEIVED';
  const names = (codes: string[]) => codes.map((code) => allergenNames[code] ?? code).join(', ');

  return (
    <article
      aria-label={`Order ${order.orderNumber}`}
      className={
        'rounded-2xl border-4 bg-kitchen-surface p-4 ' +
        URGENCY_BORDER[level] +
        (isNew && actions ? ' motion-safe:animate-pulse' : '')
      }
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-4xl font-black leading-none tabular-nums">#{order.orderNumber}</p>
          <p className="mt-2 flex flex-wrap gap-2 text-sm font-bold">
            <span className="rounded-full bg-white px-3 py-1 text-black">
              {order.fulfilment === 'delivery' ? 'DELIVERY' : 'COLLECTION'}
            </span>
            <span className="rounded-full border border-kitchen-border px-3 py-1">
              {CHANNEL_LABEL[order.channel]}
            </span>
            {order.scheduledFor && (
              <span className="rounded-full border border-kitchen-amber px-3 py-1 text-kitchen-amber">
                BOOKED {timeOfDay(order.scheduledFor)}
              </span>
            )}
          </p>
        </div>
        <div className="text-right">
          {column === null ? (
            <p className="text-lg font-bold">{FINISHED_LABEL[order.status] ?? order.status}</p>
          ) : (
            <>
              <p
                className={
                  'text-2xl font-black tabular-nums ' +
                  (level === 'late'
                    ? 'text-kitchen-red'
                    : level === 'soon'
                      ? 'text-kitchen-amber'
                      : '')
                }
              >
                {isNew ? waiting(order, now) : countdown(order, now)}
              </p>
              <p className="text-sm text-kitchen-muted">due {timeOfDay(order.estimatedReadyAt)}</p>
            </>
          )}
        </div>
      </header>

      <ul className="mt-4 space-y-2">
        {order.items.map((item) => {
          const flags = allergenFlags(item);
          const body = (
            <>
              <span className="text-2xl font-black tabular-nums">{item.quantity}×</span>
              <span className="min-w-0 flex-1">
                <span className={'block text-xl font-bold ' + (item.done ? 'line-through' : '')}>
                  {item.name}
                </span>
                <span className="block text-kitchen-muted">{item.variantName}</span>
                {item.options.map((option, index) => (
                  <span key={index} className="block">
                    {option.groupName === 'Extra toppings' ? '+ ' : ''}
                    {option.name}
                  </span>
                ))}
                {item.notes && (
                  <span className="mt-1 block rounded-lg bg-kitchen-amber px-2 py-1 font-bold text-black">
                    NOTE: {item.notes}
                  </span>
                )}
                {flags && (
                  <span className="mt-1 block rounded-lg border-2 border-kitchen-red px-2 py-1 text-sm font-bold text-kitchen-red">
                    {flags.contains.length > 0 && <>CONTAINS: {names(flags.contains)}</>}
                    {flags.contains.length > 0 && flags.mayContain.length > 0 && ' · '}
                    {flags.mayContain.length > 0 && <>MAY CONTAIN: {names(flags.mayContain)}</>}
                  </span>
                )}
              </span>
              {actions && column === 'preparing' && (
                <span
                  aria-hidden="true"
                  className={
                    'inline-flex size-9 shrink-0 items-center justify-center rounded-lg border-2 text-xl font-black ' +
                    (item.done
                      ? 'border-kitchen-green bg-kitchen-green text-black'
                      : 'border-kitchen-border')
                  }
                >
                  {item.done ? '✓' : ''}
                </span>
              )}
            </>
          );
          return (
            <li key={item.id}>
              {actions && column === 'preparing' ? (
                <button
                  type="button"
                  aria-pressed={item.done}
                  onClick={() => actions.toggleItem(order, item.id, !item.done)}
                  className="flex min-h-14 w-full items-start gap-3 rounded-xl p-2 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-4"
                >
                  {body}
                </button>
              ) : (
                <div className="flex items-start gap-3 p-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      {order.notes && (
        <p className="mt-3 rounded-xl bg-kitchen-amber p-3 text-lg font-bold text-black">
          CUSTOMER NOTE: {order.notes}
        </p>
      )}

      <p className="mt-3 text-kitchen-muted">
        {order.customerName} · {order.customerPhone}
        {order.address && (
          <span className="block text-white">
            {[order.address.line1, order.address.line2, order.address.town, order.address.postcode]
              .filter(Boolean)
              .join(', ')}
          </span>
        )}
      </p>
      {order.rejectReason && (
        <p className="mt-2 font-bold text-kitchen-red">Rejected: {order.rejectReason}</p>
      )}

      {actions && isNew && !rejecting && (
        <div className="mt-4">
          <p className="font-bold">Accept, ready in:</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {PREP_CHOICES.map((minutes) => (
              <button
                key={minutes}
                type="button"
                disabled={busy}
                onClick={() => actions.accept(order, minutes)}
                className={bigButton + ' bg-kitchen-green text-black'}
              >
                {minutes} min
                <span className="sr-only">: accept order {order.orderNumber}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => setRejecting(true)}
            className={bigButton + ' mt-2 w-full border-2 border-kitchen-red text-kitchen-red'}
          >
            Reject<span className="sr-only"> order {order.orderNumber}</span>
          </button>
        </div>
      )}

      {actions && isNew && rejecting && (
        <div className="mt-4">
          <p className="font-bold text-kitchen-red">
            Reject and refund order #{order.orderNumber}? Choose a reason:
          </p>
          <div className="mt-2 grid gap-2">
            {REJECT_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                disabled={busy}
                onClick={() => actions.reject(order, reason)}
                className={bigButton + ' bg-kitchen-red text-black'}
              >
                {reason}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className={bigButton + ' border-2 border-kitchen-border'}
            >
              Keep this order
            </button>
          </div>
        </div>
      )}

      {actions && next && (
        <button
          type="button"
          disabled={busy}
          onClick={() => actions.move(order, next.moves)}
          className={bigButton + ' mt-4 w-full bg-white text-black'}
        >
          {next.label}
          <span className="sr-only">: order {order.orderNumber}</span>
        </button>
      )}
    </article>
  );
}
