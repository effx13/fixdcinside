import type { BoardKind } from './types';

export const DC_ORIGIN = 'https://gall.dcinside.com';
export const DC_MOBILE_ORIGIN = 'https://m.dcinside.com';

/** dcinside 403s any image request whose Referer is not one of its own pages. */
export const DC_IMAGE_REFERER = 'https://gall.dcinside.com/';

export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
export const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/** Path segment that precedes `/board/...` for each board family. */
export const BOARD_PREFIX: Record<BoardKind, string> = {
  gall: '',
  mgallery: '/mgallery',
  mini: '/mini',
  person: '/person',
};

/** Hosts the image proxy is willing to talk to. Keeps it from being an open proxy. */
export const ALLOWED_MEDIA_HOSTS = ['dcinside.co.kr', 'dcinside.com', 'dccon.co.kr'];

/** Query params we forward to dcinside; anything else is dropped. */
export const FORWARDED_PARAMS = [
  'page',
  'exception_mode',
  'search_pos',
  'search_head',
  's_type',
  's_keyword',
  'sort_type',
  'headid',
];

/** Mosaic sheet geometry: one column, photos at a common width. */
export const MOSAIC_WIDTH = 1000;
export const MOSAIC_MAX_HEIGHT = 3600;
export const MOSAIC_GAP = 10;
export const MOSAIC_QUALITY = 82;

export const MAX_EMBED_DESCRIPTION = 340;
export const FETCH_TIMEOUT_MS = 8000;

/**
 * Media gets a longer budget than pages: dcinside's image servers answer a
 * Cloudflare data centre far slower than they answer a Korean home connection
 * (measured at 3-4s cold), and a timeout here shows up as a broken embed.
 */
export const MEDIA_FETCH_TIMEOUT_MS = 20000;

/** Bump when a parser change makes older cached entries wrong. */
export const CACHE_SCHEMA_VERSION = 1;

/** Posts are near-immutable; listings turn over constantly. */
export const POST_CACHE_TTL = 600;
export const LIST_CACHE_TTL = 60;
