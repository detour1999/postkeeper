// ABOUTME: Checks which handed-over cookies actually survived into the browser profile.
// ABOUTME: Chrome drops session cookies on close, so a handover must verify rather than assume.

/**
 * Which of the requested cookies are absent from what the profile stored?
 *
 * Cookies only reach disk when a persistent context closes, and Chrome never
 * writes session cookies (no expiry) at all. Without this check, handing over
 * a session cookie reports success and stores nothing.
 */
export function findMissingCookies(requested, stored) {
  const key = (c) => `${c.name} ${c.domain}`;
  const present = new Set(stored.map(key));
  return requested.filter((c) => !present.has(key(c)));
}
