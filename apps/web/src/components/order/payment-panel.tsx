'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '@mp/api-client';
import { formatPence } from '@mp/pricing';
import { Button } from '@mp/ui';
import { browserApi } from '@/lib/api';
import type { PaymentSession } from '@/lib/payment-session';

// The payment step. Whatever happens here, the order is only marked paid when
// the API receives the payment provider's verified webhook; this component
// just collects the payment and then waits for the order status to change.

const stripeLoaders = new Map<string, Promise<Stripe | null>>();
function stripeFor(publishableKey: string) {
  let loader = stripeLoaders.get(publishableKey);
  if (!loader) {
    loader = loadStripe(publishableKey);
    stripeLoaders.set(publishableKey, loader);
  }
  return loader;
}

function StripeForm({ totalPence, onSubmitted }: { totalPence: number; onSubmitted: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setError(null);
    const result = await stripe.confirmPayment({
      elements,
      // Some payment methods leave the site and come back here.
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });
    if (result.error) {
      setError(result.error.message ?? 'The payment did not go through. Please try again.');
      setBusy(false);
      return;
    }
    onSubmitted();
  }

  return (
    <form onSubmit={pay}>
      <PaymentElement />
      <Button type="submit" size="lg" className="mt-4 w-full" disabled={!stripe || busy}>
        {busy ? 'Processing…' : `Pay ${formatPence(totalPence)}`}
      </Button>
      <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
        {error}
      </p>
    </form>
  );
}

function SimulatorForm({
  orderId,
  orderToken,
  totalPence,
  onSubmitted,
}: {
  orderId: string;
  orderToken: string;
  totalPence: number;
  onSubmitted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(outcome: 'succeeded' | 'failed') {
    setBusy(true);
    setMessage(null);
    try {
      await browserApi().simulatePayment(orderId, orderToken, outcome);
      if (outcome === 'failed') {
        setMessage('Simulated a declined card. The order is still unpaid; try again.');
      } else {
        onSubmitted();
      }
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not reach the shop.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="rounded-lg bg-cream-200 p-3 text-sm">
        <span className="font-semibold">Test mode.</span> No card is charged. This stands in for the
        card form until Stripe is connected.
      </p>
      <div className="mt-4 grid gap-2">
        <Button type="button" size="lg" disabled={busy} onClick={() => run('succeeded')}>
          Simulate paying {formatPence(totalPence)}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => run('failed')}>
          Simulate a declined card
        </Button>
      </div>
      <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
        {message}
      </p>
    </div>
  );
}

export function PaymentPanel({
  orderId,
  orderToken,
  totalPence,
  session,
  onSubmitted,
}: {
  orderId: string;
  orderToken: string | null;
  totalPence: number;
  session: PaymentSession | null;
  /** Called when the payment has been handed to the provider. */
  onSubmitted: () => void;
}) {
  const stripePromise = useMemo(
    () =>
      session?.provider === 'stripe' && session.publishableKey
        ? stripeFor(session.publishableKey)
        : null,
    [session],
  );

  if (session?.provider === 'simulator' && orderToken) {
    return (
      <SimulatorForm
        orderId={orderId}
        orderToken={orderToken}
        totalPence={totalPence}
        onSubmitted={onSubmitted}
      />
    );
  }
  if (stripePromise && session?.clientSecret) {
    return (
      <Elements stripe={stripePromise} options={{ clientSecret: session.clientSecret }}>
        <StripeForm totalPence={totalPence} onSubmitted={onSubmitted} />
      </Elements>
    );
  }
  return (
    <p className="text-sm">
      We cannot show the payment form in this tab. Please go back to the basket and check out again;
      you will not be charged twice, because this order has not been paid.
    </p>
  );
}
