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

  return {
    health: () => request<HealthResponse>('/v1/health'),
    me: () => request<MeResponse>('/v1/me'),
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;
