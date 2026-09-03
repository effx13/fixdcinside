import { DC_MOBILE_ORIGIN, DC_ORIGIN, DESKTOP_UA, FETCH_TIMEOUT_MS, MOBILE_UA } from '../constants';
import type { Target } from '../types';

export class DcFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DcFetchError';
  }
}

/**
 * dcinside serves plain server-rendered HTML, but only to clients that look like
 * a browser: a bare fetch gets a challenge page or a 403.
 */
function browserHeaders(mobile: boolean, referer: string): HeadersInit {
  return {
    'User-Agent': mobile ? MOBILE_UA : DESKTOP_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    Referer: referer,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Upgrade-Insecure-Requests': '1',
  };
}

async function get(url: string, mobile: boolean, referer: string, cacheTtl: number): Promise<string> {
  const response = await fetch(url, {
    headers: browserHeaders(mobile, referer),
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    // Let Cloudflare's edge cache absorb repeat lookups of the same post.
    cf: { cacheTtl, cacheEverything: true },
  });

  if (!response.ok) {
    throw new DcFetchError(`dcinside responded ${response.status}`, response.status);
  }
  return response.text();
}

export interface FetchedPage {
  html: string;
  /** Which layout the HTML uses - the parsers differ. */
  layout: 'desktop' | 'mobile';
}

/** The m.dcinside.com equivalent of a target. Same content, a third of the bytes. */
function mobileUrl(target: Target): string {
  const base = `${DC_MOBILE_ORIGIN}/board/${target.id}`;
  return target.kind === 'post' ? `${base}/${target.no}` : base;
}

/**
 * Fetch a dcinside page as HTML. Tries the desktop layout first because it
 * carries the richest markup, and falls back to the mobile site when desktop
 * is blocked or rate-limited.
 */
export async function fetchPage(target: Target, desktopUrl: string): Promise<FetchedPage> {
  const listReferer = `${DC_ORIGIN}/board/lists/?id=${encodeURIComponent(target.id)}`;
  try {
    const html = await get(desktopUrl, false, listReferer, 60);
    // dcinside answers 200 with an interstitial when it dislikes the client.
    if (html.includes('gallview_head') || html.includes('gall_list') || html.length > 20000) {
      return { html, layout: 'desktop' };
    }
  } catch (error) {
    if (error instanceof DcFetchError && error.status === 404) throw error;
  }

  const html = await get(mobileUrl(target), true, DC_MOBILE_ORIGIN, 60);
  return { html, layout: 'mobile' };
}
