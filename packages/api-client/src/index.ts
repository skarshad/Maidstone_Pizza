import type {
  AdminMenu,
  CategoryPatchInput,
  ItemAvailabilityInput,
  Menu,
  SaveMenuItemInput,
  SaveMenuOptionInput,
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

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
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
      } | null;
      throw new ApiError(
        res.status,
        body?.error?.code ?? 'unknown',
        body?.error?.message ?? res.statusText,
      );
    }
    return (await res.json()) as T;
  }

  const send = (method: string, body: unknown): RequestInit => ({
    method,
    body: JSON.stringify(body),
  });

  return {
    health: () => request<HealthResponse>('/v1/health'),
    me: () => request<MeResponse>('/v1/me'),
    menu: () => request<Menu>('/v1/menu'),
    admin: {
      menu: () => request<AdminMenu>('/v1/admin/menu', { cache: 'no-store' }),
      createItem: (input: SaveMenuItemInput) =>
        request<{ id: string }>('/v1/admin/menu/items', send('POST', input)),
      updateItem: (id: string, input: SaveMenuItemInput) =>
        request<{ id: string }>(`/v1/admin/menu/items/${id}`, send('PUT', input)),
      setItemAvailability: (id: string, input: ItemAvailabilityInput) =>
        request<{ ok: true }>(`/v1/admin/menu/items/${id}/availability`, send('PATCH', input)),
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
