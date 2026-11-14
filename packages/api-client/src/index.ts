import type {
  AdminMenu,
  CategoryPatchInput,
  CheckoutResult,
  DeliveryCheckResult,
  ItemAvailabilityInput,
  KitchenBoard,
  Menu,
  OrderSummary,
  OrderView,
  PricedBasketResponse,
  SaveMenuItemInput,
  SaveMenuOptionInput,
  ShopInfo,
} from '@mp/validation';

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns the current Supabase access token, if signed in. */
  getAccessToken?: () => Promise<string | null> | string | null;
  fetch?: typeof fetch;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** The re-priced basket, sent with price_changed and basket_invalid errors. */
  readonly basket?: PricedBasketResponse;

  constructor(status: number, code: string, message: string, basket?: PricedBasketResponse) {
    super(message);
    this.status = status;
    this.code = code;
    this.basket = basket;
  }
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  database: 'ok' | 'down';
  time: string;
}

export interface MeResponse {
  id: string;
  email: string | null;
  role: string;
}

/** What the checkout form sends. Prices are never sent: the server works them out. */
export interface CheckoutRequest {
  lines: Array<{
    itemId: string;
    variantId: string;
    quantity: number;
    selections: Array<{ groupId: string; optionIds: string[] }>;
    notes: string;
  }>;
  fulfilment: 'delivery' | 'collection';
  scheduledFor: string | null;
  customer: { name: string; email: string; phone: string };
  address?: { line1: string; line2: string; town: string; postcode: string };
  notes: string;
  tipPence: number;
  allergenAcknowledged: true;
  expectedTotalPence: number;
  paymentMethod: 'card';
}

/** Minimal typed client for apps/api. Endpoints are added phase by phase. */
export function createApiClient(options: ApiClientOptions) {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/$/, '');

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await options.getAccessToken?.();
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (init.body) headers.set('Content-Type', 'application/json');
    const res = await doFetch(`${base}${path}`, { ...init, headers });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
        basket?: PricedBasketResponse;
      } | null;
      throw new ApiError(
        res.status,
        body?.error?.code ?? 'unknown',
        body?.error?.message ?? res.statusText,
        body?.basket,
      );
    }
    return (await res.json()) as T;
  }

  const send = (method: string, body: unknown, headers?: Record<string, string>): RequestInit => ({
    method,
    body: JSON.stringify(body),
    headers,
  });
  const withToken = (orderToken?: string | null): RequestInit => ({
    cache: 'no-store',
    headers: orderToken ? { 'X-Order-Token': orderToken } : undefined,
  });

  return {
    health: () => request<HealthResponse>('/v1/health'),
    me: () => request<MeResponse>('/v1/me'),
    menu: () => request<Menu>('/v1/menu'),

    shop: () => request<ShopInfo>('/v1/shop', { cache: 'no-store' }),
    checkDelivery: (postcode: string) =>
      request<DeliveryCheckResult>('/v1/delivery/check', send('POST', { postcode })),
    /**
     * Places an order. Pass the same idempotencyKey when retrying the same
     * attempt, so a double click or a retry cannot create two orders.
     */
    checkout: (input: CheckoutRequest, idempotencyKey: string) =>
      request<CheckoutResult>(
        '/v1/checkout',
        send('POST', input, { 'Idempotency-Key': idempotencyKey }),
      ),
    /** One order. Guests pass the token from their order link. */
    order: (id: string, orderToken?: string | null) =>
      request<OrderView>(`/v1/orders/${id}`, withToken(orderToken)),
    myOrders: () => request<OrderSummary[]>('/v1/me/orders', { cache: 'no-store' }),
    /** Test environments only: pretend the card payment succeeded or failed. */
    simulatePayment: (orderId: string, orderToken: string, outcome: 'succeeded' | 'failed') =>
      request<{ received: boolean; outcome: string }>(
        `/v1/dev/payments/${orderId}/simulate`,
        send('POST', { outcome }, { 'X-Order-Token': orderToken }),
      ),

    /** Kitchen screen. Needs a kitchen, manager or admin token. */
    kitchen: {
      board: () => request<KitchenBoard>('/v1/kitchen/orders', { cache: 'no-store' }),
      accept: (id: string, prepMinutes: number) =>
        request<{ ok: true }>(`/v1/kitchen/orders/${id}/accept`, send('POST', { prepMinutes })),
      reject: (id: string, reason: string) =>
        request<{ ok: true; refund: 'done' | 'pending' | 'needs_review' | 'none' }>(
          `/v1/kitchen/orders/${id}/reject`,
          send('POST', { reason }),
        ),
      setStatus: (
        id: string,
        to: 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'COLLECTED' | 'COMPLETED',
      ) => request<{ ok: true }>(`/v1/kitchen/orders/${id}/status`, send('POST', { to })),
      setItemDone: (id: string, itemId: string, done: boolean) =>
        request<{ ok: true }>(
          `/v1/kitchen/orders/${id}/items/${itemId}/done`,
          send('POST', { done }),
        ),
    },

    admin: {
      menu: () => request<AdminMenu>('/v1/admin/menu', { cache: 'no-store' }),
      createItem: (input: SaveMenuItemInput) =>
        request<{ id: string }>('/v1/admin/menu/items', send('POST', input)),
      updateItem: (id: string, input: SaveMenuItemInput) =>
        request<{ id: string }>(`/v1/admin/menu/items/${id}`, send('PUT', input)),
      setItemAvailability: (id: string, input: ItemAvailabilityInput) =>
        request<{ ok: true }>(`/v1/admin/menu/items/${id}/availability`, send('PATCH', input)),
      setItemImage: (id: string, imagePath: string | null) =>
        request<{ ok: true }>(`/v1/admin/menu/items/${id}/image`, send('PATCH', { imagePath })),
      deleteItem: (id: string) =>
        request<{ ok: true }>(`/v1/admin/menu/items/${id}`, { method: 'DELETE' }),
      saveOption: (id: string, input: SaveMenuOptionInput) =>
        request<{ ok: true }>(`/v1/admin/menu/options/${id}`, send('PUT', input)),
      updateCategory: (id: string, input: CategoryPatchInput) =>
        request<{ ok: true }>(`/v1/admin/menu/categories/${id}`, send('PATCH', input)),
    },
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;
