// Plain in-process TTL memoization, for query results too large for Next's
// unstable_cache: its default data-cache handler rejects any entry over 2MB
// ("items over 2MB can not be cached"), and that rejection happens on an
// un-awaited internal write -- it surfaces as a server-side unhandledRejection
// we can't catch, not as a normal thrown error. Calendar years with a few
// thousand competitions serialize past that limit on their own. This has the
// same "lives only as long as the warm server instance" caveat
// unstable_cache's own handler already has -- just without the size cap.
export function memoCache<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>, ttlMs: number) {
  const store = new Map<string, { value: Promise<R>; expires: number }>();
  return (...args: Args): Promise<R> => {
    const key = JSON.stringify(args);
    const hit = store.get(key);
    const now = Date.now();
    if (hit && hit.expires > now) return hit.value;
    const value = fn(...args).catch((err) => {
      store.delete(key); // don't cache a rejected call
      throw err;
    });
    store.set(key, { value, expires: now + ttlMs });
    return value;
  };
}
