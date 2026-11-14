import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import Stripe from 'stripe';

// Card payments. The rest of the API talks to this interface, never to Stripe
// directly, so the same order flow runs against Stripe or the local simulator.
//
// An order is only ever marked paid from a webhook event that passed
// parseWebhook(): the browser saying "payment succeeded" is never trusted.

export type PaymentEventType =
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed'
  | 'charge.refunded'
  | 'charge.dispute.created';

/** A verified webhook event, reduced to what the order logic needs. */
export interface PaymentEvent {
  eventId: string;
  type: PaymentEventType;
  /** The provider's id for the payment (Stripe PaymentIntent id). */
  providerRef: string;
  amountPence?: number;
  refundedPence?: number;
}

export class WebhookSignatureError extends Error {}

export interface PaymentProvider {
  readonly name: 'stripe' | 'simulator';
  /** Safe to send to browsers. Null for the simulator. */
  readonly publishableKey: string | null;
  /**
   * Starts a payment for an order. Calling it again with the same
   * idempotencyKey returns the same payment instead of creating a second one.
   */
  createPayment(input: {
    orderId: string;
    orderNumber: number;
    amountPence: number;
    idempotencyKey: string;
  }): Promise<{ ref: string; clientSecret: string | null }>;
  /** Best effort: stops an unpaid payment being completed later. */
  cancelPayment(ref: string): Promise<void>;
  /**
   * Refunds a paid payment, in full or in part. Returns an event to apply
   * straight away when the provider has no webhook of its own (the simulator);
   * Stripe returns null and confirms through its charge.refunded webhook.
   */
  refundPayment(input: {
    ref: string;
    amountPence: number;
    idempotencyKey: string;
  }): Promise<PaymentEvent | null>;
  /**
   * Verifies a webhook request and returns its event, or null for an event type
   * we do not act on. Throws WebhookSignatureError if it is not genuine.
   */
  parseWebhook(rawBody: string, signature: string | null): Promise<PaymentEvent | null>;
}

// ---- Stripe ------------------------------------------------------------------

/** A payment's id, whether Stripe sent it expanded or as a bare id. */
function refOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

export function createStripeProvider(config: {
  secretKey: string;
  webhookSecret: string;
  publishableKey: string;
}): PaymentProvider {
  const stripe = new Stripe(config.secretKey);

  return {
    name: 'stripe',
    publishableKey: config.publishableKey,

    async createPayment({ orderId, orderNumber, amountPence, idempotencyKey }) {
      const intent = await stripe.paymentIntents.create(
        {
          amount: amountPence,
          currency: 'gbp',
          // Cards, Apple Pay and Google Pay, as enabled in the Stripe Dashboard.
          automatic_payment_methods: { enabled: true },
          description: `Maidstone Pizza order #${orderNumber}`,
          metadata: { order_id: orderId, order_number: String(orderNumber) },
        },
        { idempotencyKey },
      );
      return { ref: intent.id, clientSecret: intent.client_secret };
    },

    async cancelPayment(ref) {
      await stripe.paymentIntents.cancel(ref);
    },

    async refundPayment({ ref, amountPence, idempotencyKey }) {
      await stripe.refunds.create({ payment_intent: ref, amount: amountPence }, { idempotencyKey });
      return null;
    },

    async parseWebhook(rawBody, signature) {
      if (!signature) throw new WebhookSignatureError('Missing Stripe-Signature header');
      let event: Stripe.Event;
      try {
        // Needs the exact bytes Stripe sent; the default tolerance is 5 minutes.
        event = await stripe.webhooks.constructEventAsync(rawBody, signature, config.webhookSecret);
      } catch (error) {
        throw new WebhookSignatureError(error instanceof Error ? error.message : 'Bad signature');
      }

      switch (event.type) {
        case 'payment_intent.succeeded':
          return {
            eventId: event.id,
            type: event.type,
            providerRef: event.data.object.id,
            amountPence: event.data.object.amount_received,
          };
        case 'payment_intent.payment_failed':
          return { eventId: event.id, type: event.type, providerRef: event.data.object.id };
        case 'charge.refunded': {
          const ref = refOf(event.data.object.payment_intent);
          if (!ref) return null;
          return {
            eventId: event.id,
            type: event.type,
            providerRef: ref,
            refundedPence: event.data.object.amount_refunded,
          };
        }
        case 'charge.dispute.created': {
          const ref = refOf(event.data.object.payment_intent);
          return ref ? { eventId: event.id, type: event.type, providerRef: ref } : null;
        }
        default:
          return null;
      }
    },
  };
}

// ---- Simulator ---------------------------------------------------------------
//
// Stands in for Stripe while there is no Stripe account, and in automated
// tests. It signs its own webhook events with the same scheme Stripe documents
// (HMAC-SHA256 over "<timestamp>.<body>", five-minute tolerance), so a
// simulated payment exercises the same verified-webhook path as a real one.
// It is refused in production (see deps.ts).

const TOLERANCE_SECONDS = 300;

function sign(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export interface SimulatorProvider extends PaymentProvider {
  /** Builds a signed webhook request for an event, as the simulator would send it. */
  signedWebhook(
    event: Omit<PaymentEvent, 'eventId'>,
    now?: Date,
  ): { body: string; signature: string };
}

export function createSimulatorProvider(config: {
  secret: string;
  now?: () => Date;
}): SimulatorProvider {
  const now = config.now ?? (() => new Date());

  return {
    name: 'simulator',
    publishableKey: null,

    async createPayment({ idempotencyKey }) {
      // Deterministic, so a retried checkout gets the same payment back.
      const ref = `sim_${createHmac('sha256', config.secret).update(idempotencyKey).digest('hex').slice(0, 24)}`;
      return { ref, clientSecret: null };
    },

    async cancelPayment() {},

    async refundPayment({ ref, amountPence, idempotencyKey }) {
      // Deterministic id: refunding twice with the same key is applied once.
      const eventId = `evt_sim_refund_${createHmac('sha256', config.secret).update(idempotencyKey).digest('hex').slice(0, 24)}`;
      return { eventId, type: 'charge.refunded', providerRef: ref, refundedPence: amountPence };
    },

    signedWebhook(event, at = now()) {
      const body = JSON.stringify({ id: `evt_sim_${randomUUID()}`, ...event });
      const timestamp = Math.floor(at.getTime() / 1000);
      return { body, signature: `t=${timestamp},v1=${sign(config.secret, timestamp, body)}` };
    },

    async parseWebhook(rawBody, signature) {
      const parts = new Map(
        (signature ?? '').split(',').map((part) => {
          const index = part.indexOf('=');
          return [part.slice(0, index), part.slice(index + 1)] as const;
        }),
      );
      const timestamp = Number(parts.get('t'));
      const given = parts.get('v1') ?? '';
      if (!Number.isInteger(timestamp) || !given) {
        throw new WebhookSignatureError('Missing signature');
      }
      const expected = sign(config.secret, timestamp, rawBody);
      const a = Buffer.from(given, 'utf8');
      const b = Buffer.from(expected, 'utf8');
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new WebhookSignatureError('Signature does not match');
      }
      if (Math.abs(now().getTime() / 1000 - timestamp) > TOLERANCE_SECONDS) {
        throw new WebhookSignatureError('Signature is too old');
      }

      const event = JSON.parse(rawBody) as {
        id: string;
        type: PaymentEventType;
        providerRef: string;
        amountPence?: number;
        refundedPence?: number;
      };
      return {
        eventId: event.id,
        type: event.type,
        providerRef: event.providerRef,
        amountPence: event.amountPence,
        refundedPence: event.refundedPence,
      };
    },
  };
}
