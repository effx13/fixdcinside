import { CACHE_SCHEMA_VERSION } from './constants';

/**
 * Cache parsed pages in KV so repeat embeds of the same link do not hit
 * dcinside again. A post that gets posted in five Discord channels should cost
 * one upstream fetch, not five.
 *
 * The Worker also works with no KV namespace bound - every lookup simply misses.
 */
export interface CacheOptions {
  /** Seconds to keep the entry. KV enforces a 60s floor. */
  ttl: number;
  /** Runs the KV write after the response has been sent. */
  waitUntil?: (promise: Promise<unknown>) => void;
}

/** Bumping the schema version retires entries written by an older parser. */
function cacheKey(kind: string, url: string): string {
  return `v${CACHE_SCHEMA_VERSION}:${kind}:${url}`;
}

export async function withCache<T>(
  env: Env,
  kind: string,
  url: string,
  options: CacheOptions,
  produce: () => Promise<T>,
): Promise<{ value: T; hit: boolean }> {
  const kv = env.CACHE;
  if (!kv) return { value: await produce(), hit: false };

  const key = cacheKey(kind, url);
  try {
    const cached = await kv.get<T>(key, 'json');
    if (cached !== null) return { value: cached, hit: true };
  } catch {
    // A read failure is not worth failing the request over; fall through.
  }

  const value = await produce();
  const write = kv
    .put(key, JSON.stringify(value), { expirationTtl: Math.max(60, options.ttl) })
    .catch(() => undefined);
  if (options.waitUntil) options.waitUntil(write);
  else await write;

  return { value, hit: false };
}
