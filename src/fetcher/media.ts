import { ALLOWED_MEDIA_HOSTS, DC_IMAGE_REFERER, DESKTOP_UA, MEDIA_FETCH_TIMEOUT_MS } from '../constants';

/** URL-safe base64 so proxied links stay clean in an embed. */
export function encodeMediaUrl(url: string): string {
  const bytes = new TextEncoder().encode(url);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeMediaUrl(token: string): string | null {
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function isAllowedMediaUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return ALLOWED_MEDIA_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

function upstreamHeaders(range: string | null): HeadersInit {
  return {
    'User-Agent': DESKTOP_UA,
    // dcinside 403s any image request whose Referer is not one of its own pages.
    Referer: DC_IMAGE_REFERER,
    Accept: 'image/avif,image/webp,image/png,image/jpeg,video/*,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    ...(range ? { Range: range } : {}),
  };
}

/** Ask Cloudflare to hold the upstream bytes so the next colo hit is warm. */
const UPSTREAM_CACHE = { cacheTtl: 86400, cacheEverything: true } as const;

/**
 * Warm the cache for an image before anyone asks for it.
 *
 * A crawler fetches the embed HTML first and the og:image a moment later, so
 * starting the upstream fetch during that gap turns the crawler's own request
 * into a cache hit. Call it from waitUntil - failures are not worth reporting.
 */
export async function prefetchMedia(target: string): Promise<void> {
  if (!isAllowedMediaUrl(target)) return;
  try {
    const response = await fetch(target, {
      headers: upstreamHeaders(null),
      signal: AbortSignal.timeout(MEDIA_FETCH_TIMEOUT_MS),
      cf: UPSTREAM_CACHE,
    });
    // The body has to be drained for Cloudflare to store the entry.
    await response.arrayBuffer();
  } catch {
    // Best effort only; the real request will retry.
  }
}

/**
 * dcinside serves every image as `application/octet-stream`, which Discord
 * refuses to render. Sniff the real type from the magic bytes instead.
 */
function sniffContentType(bytes: Uint8Array): string {
  const startsWith = (...signature: number[]): boolean =>
    signature.every((byte, index) => bytes[index] === byte);

  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (startsWith(0x42, 0x4d)) return 'image/bmp';
  // RIFF....WEBP - the WEBP marker sits at offset 8.
  if (startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp';
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'video/mp4';
  return 'application/octet-stream';
}

const SNIFF_BYTES = 16;

/**
 * Read just enough of the body to identify the format, then hand back a stream
 * that replays what was read followed by the rest.
 *
 * Buffering the whole file instead would add the download time to
 * time-to-first-byte, and a crawler that gives up early sees a broken image.
 */
async function sniffAndReplay(
  body: ReadableStream<Uint8Array>,
): Promise<{ contentType: string; stream: ReadableStream<Uint8Array> }> {
  const reader = body.getReader();
  const head: Uint8Array[] = [];
  let seen = 0;

  while (seen < SNIFF_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    head.push(value);
    seen += value.byteLength;
  }

  const signature = new Uint8Array(SNIFF_BYTES);
  let offset = 0;
  for (const chunk of head) {
    if (offset >= SNIFF_BYTES) break;
    const slice = chunk.subarray(0, SNIFF_BYTES - offset);
    signature.set(slice, offset);
    offset += slice.byteLength;
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of head) controller.enqueue(chunk);
      if (seen < SNIFF_BYTES) controller.close();
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });

  return { contentType: sniffContentType(signature), stream };
}

/**
 * Proxy one dcinside media file, adding the Referer that dcinside's hotlink
 * check demands and fixing up the content type on the way out.
 */
export async function proxyMedia(
  target: string,
  request: Request,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<Response> {
  if (!isAllowedMediaUrl(target)) {
    return new Response('media host not allowed', { status: 400 });
  }

  const range = request.headers.get('Range');
  // Range responses are partial by definition, so they never go in the cache.
  const cache = range ? null : caches.default;
  const cached = await cache?.match(request);
  if (cached) return cached;

  const upstream = await fetch(target, {
    headers: upstreamHeaders(range),
    signal: AbortSignal.timeout(MEDIA_FETCH_TIMEOUT_MS),
    cf: UPSTREAM_CACHE,
  });

  if ((!upstream.ok && upstream.status !== 206) || !upstream.body) {
    return new Response('upstream media fetch failed', { status: 502 });
  }

  const headers = new Headers({
    'Cache-Control': 'public, max-age=86400, immutable',
    'Access-Control-Allow-Origin': '*',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff',
  });
  for (const header of ['Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
    const value = upstream.headers.get(header);
    if (value) headers.set(header, value);
  }
  // Only trust the upstream length when the body reached us untouched.
  const length = upstream.headers.get('Content-Length');
  if (length && !upstream.headers.get('Content-Encoding')) headers.set('Content-Length', length);

  // Workers type the body as ReadableStream<any>; it is always bytes.
  const upstreamBody = upstream.body as ReadableStream<Uint8Array>;
  const declared = upstream.headers.get('Content-Type') ?? '';
  const trustworthy =
    declared && !declared.startsWith('application/octet-stream') && !declared.startsWith('text/');

  let body: ReadableStream<Uint8Array>;
  if (trustworthy) {
    headers.set('Content-Type', declared);
    body = upstreamBody;
  } else {
    const sniffed = await sniffAndReplay(upstreamBody);
    headers.set('Content-Type', sniffed.contentType);
    body = sniffed.stream;
  }

  const response = new Response(body, { status: upstream.status, headers });
  if (cache && response.status === 200) {
    const stored = response.clone();
    if (waitUntil) waitUntil(cache.put(request, stored));
    else void cache.put(request, stored);
  }
  return response;
}
