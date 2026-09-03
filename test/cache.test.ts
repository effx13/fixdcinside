import { describe, expect, it, vi } from 'vitest';
import { withCache } from '../src/cache';

/** Minimal stand-in for the bits of KVNamespace withCache actually uses. */
function fakeKv(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    get: vi.fn((key: string): Promise<unknown> => {
      const raw = store.get(key);
      return Promise.resolve(raw === undefined ? null : (JSON.parse(raw) as unknown));
    }),
    put: vi.fn((key: string, value: string, _options?: { expirationTtl?: number }): Promise<void> => {
      store.set(key, value);
      return Promise.resolve();
    }),
  };
}

const envWith = (kv: unknown) => ({ CACHE: kv }) as unknown as Env;

describe('withCache', () => {
  it('runs the producer on a miss and stores the result', async () => {
    const kv = fakeKv();
    const produce = vi.fn(() => Promise.resolve({ title: 'hello' }));

    const result = await withCache(envWith(kv), 'post', 'https://dc/1', { ttl: 600 }, produce);

    expect(result).toEqual({ value: { title: 'hello' }, hit: false });
    expect(produce).toHaveBeenCalledOnce();
    expect(kv.put).toHaveBeenCalledOnce();
    expect(kv.put.mock.calls[0]?.[2]).toEqual({ expirationTtl: 600 });
  });

  it('serves the second request from KV without calling the producer', async () => {
    const kv = fakeKv();
    const produce = vi.fn(() => Promise.resolve({ title: 'hello' }));

    await withCache(envWith(kv), 'post', 'https://dc/1', { ttl: 600 }, produce);
    const second = await withCache(envWith(kv), 'post', 'https://dc/1', { ttl: 600 }, produce);

    expect(second).toEqual({ value: { title: 'hello' }, hit: true });
    expect(produce).toHaveBeenCalledOnce();
  });

  it('keys posts and listings separately', async () => {
    const kv = fakeKv();
    await withCache(envWith(kv), 'post', 'https://dc/1', { ttl: 600 }, () => Promise.resolve('a'));
    await withCache(envWith(kv), 'list', 'https://dc/1', { ttl: 60 }, () => Promise.resolve('b'));

    expect(kv.store.size).toBe(2);
    expect([...kv.store.keys()].every((key) => key.startsWith('v1:'))).toBe(true);
  });

  it('respects the 60 second KV floor', async () => {
    const kv = fakeKv();
    await withCache(envWith(kv), 'list', 'https://dc/1', { ttl: 5 }, () => Promise.resolve('a'));
    expect(kv.put.mock.calls[0]?.[2]).toEqual({ expirationTtl: 60 });
  });

  it('defers the write when a waitUntil is available', async () => {
    const kv = fakeKv();
    const waitUntil = vi.fn();

    await withCache(envWith(kv), 'post', 'https://dc/1', { ttl: 600, waitUntil }, () => Promise.resolve('a'));

    expect(waitUntil).toHaveBeenCalledOnce();
  });

  it('still serves the page when KV reads fail', async () => {
    const kv = fakeKv();
    kv.get.mockRejectedValueOnce(new Error('kv down'));

    const result = await withCache(envWith(kv), 'post', 'https://dc/1', { ttl: 600 }, () =>
      Promise.resolve('fresh'),
    );

    expect(result).toEqual({ value: 'fresh', hit: false });
  });

  it('works with no namespace bound at all', async () => {
    const produce = vi.fn(() => Promise.resolve('fresh'));
    const result = await withCache(envWith(undefined), 'post', 'https://dc/1', { ttl: 600 }, produce);

    expect(result).toEqual({ value: 'fresh', hit: false });
    expect(produce).toHaveBeenCalledOnce();
  });
});
