/**
 * Returns `next` only if it is a same-site relative path, otherwise the fallback.
 * Prevents open redirects through ?next= on login and auth callback routes.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return fallback;
  }
  try {
    const url = new URL(next, 'http://local.invalid');
    if (url.origin !== 'http://local.invalid') return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
