import { ALLOWED_MEDIA_HOSTS, DC_IMAGE_REFERER, DESKTOP_UA, FETCH_TIMEOUT_MS } from '../constants';

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
  if (startsWith(0x52, 0x49, 0x46, 0x46) && startsWith(0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  // RIFF....WEBP - the WEBP marker sits at offset 8.
  if (startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp';
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'video/mp4';
  return 'application/octet-stream';
}

/**
 * Proxy one dcinside media file, adding the Referer that dcinside's hotlink
 * check demands and fixing up the content type on the way out.
 */
export async function proxyMedia(target: string, request: Request): Promise<Response> {
  if (!isAllowedMediaUrl(target)) {
    return new Response('media host not allowed', { status: 400 });
  }

  const range = request.headers.get('Range');
  const upstream = await fetch(target, {
    headers: {
      'User-Agent': DESKTOP_UA,
      Referer: DC_IMAGE_REFERER,
      Accept: 'image/avif,image/webp,image/png,image/jpeg,video/*,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      ...(range ? { Range: range } : {}),
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cf: { cacheTtl: 86400, cacheEverything: true },
  });

  if (!upstream.ok && upstream.status !== 206) {
    return new Response('upstream media fetch failed', { status: 502 });
  }

  const declared = upstream.headers.get('Content-Type') ?? '';
  const needsSniff =
    !declared || declared.startsWith('application/octet-stream') || declared.startsWith('text/');

  const headers = new Headers({
    'Cache-Control': 'public, max-age=86400, immutable',
    'Access-Control-Allow-Origin': '*',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff',
  });
  for (const header of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
    const value = upstream.headers.get(header);
    if (value) headers.set(header, value);
  }

  if (!needsSniff) {
    headers.set('Content-Type', declared);
    return new Response(upstream.body, { status: upstream.status, headers });
  }

  // Buffering is fine here: dcinside caps uploads well below the Worker memory limit.
  const buffer = await upstream.arrayBuffer();
  headers.set('Content-Type', sniffContentType(new Uint8Array(buffer.slice(0, 16))));
  headers.set('Content-Length', String(buffer.byteLength));
  return new Response(buffer, { status: upstream.status, headers });
}
