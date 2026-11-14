import type { CheckoutResult } from '@mp/validation';

// What the payment step needs, kept for this browser tab only (sessionStorage).
// The Stripe client secret is made for the browser, but it only exists until
// the tab closes and is never written anywhere longer-lived.

export interface PaymentSession {
  provider: 'stripe' | 'simulator';
  clientSecret: string | null;
  publishableKey: string | null;
}

const key = (orderId: string) => `mp.pay.${orderId}`;
const LAST_ORDER = 'mp.lastOrder';

export function rememberPayment(result: CheckoutResult): void {
  try {
    window.sessionStorage.setItem(key(result.orderId), JSON.stringify(result.payment));
    window.sessionStorage.setItem(LAST_ORDER, result.orderId);
  } catch {
    // Storage unavailable: the order page then asks the customer to start again.
  }
}

export function recallPayment(orderId: string): PaymentSession | null {
  try {
    const raw = window.sessionStorage.getItem(key(orderId));
    return raw ? (JSON.parse(raw) as PaymentSession) : null;
  } catch {
    return null;
  }
}

/**
 * True once, for the order just placed from this tab: the caller empties the
 * basket when that order is confirmed paid.
 */
export function takeBasketClearFor(orderId: string): boolean {
  try {
    if (window.sessionStorage.getItem(LAST_ORDER) !== orderId) return false;
    window.sessionStorage.removeItem(LAST_ORDER);
    return true;
  } catch {
    return false;
  }
}
