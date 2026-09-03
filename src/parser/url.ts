import { BOARD_PREFIX, DC_ORIGIN, FORWARDED_PARAMS } from '../constants';
import type { BoardKind, ListTarget, PostTarget, Target } from '../types';

const BOARD_KINDS: BoardKind[] = ['mgallery', 'mini', 'person'];

/**
 * The worker's own routes. Without this, `/media` would be read as the
 * shorthand for a gallery called "media" and redirect to dcinside.
 */
const RESERVED_PATHS = new Set(['api', 'media', 'oembed', 'robots.txt', 'icon.svg', 'favicon.ico']);

function pickExtra(params: URLSearchParams): Record<string, string> {
  const extra: Record<string, string> = {};
  for (const key of FORWARDED_PARAMS) {
    const value = params.get(key);
    if (value) extra[key] = value;
  }
  return extra;
}

/**
 * Turn an incoming request URL into a dcinside target.
 *
 * Accepts every shape a user might paste after swapping the host:
 *   /board/view/?id=cat&no=1                 (gall.dcinside.com)
 *   /mgallery/board/view/?id=sff&no=1        (minor gallery)
 *   /mini/board/lists/?id=x                  (mini gallery)
 *   /board/sff/1719767                       (m.dcinside.com)
 *   /board/sff                               (m.dcinside.com list)
 *   /sff/1719767                             (shorthand)
 *   /sff                                     (shorthand list)
 */
export function parseTarget(url: URL): Target | null {
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (segments.length === 0) return null;
  if (RESERVED_PATHS.has(segments[0]!)) return null;

  let board: BoardKind = 'gall';
  if (BOARD_KINDS.includes(segments[0] as BoardKind)) {
    board = segments.shift() as BoardKind;
  }

  const extra = pickExtra(url.searchParams);

  // Query-string form: /board/view/?id=&no= and /board/lists/?id=
  if (segments[0] === 'board' && (segments[1] === 'view' || segments[1] === 'lists')) {
    const id = url.searchParams.get('id');
    if (!id) return null;
    if (segments[1] === 'lists') return { kind: 'list', board, id, extra };
    const no = url.searchParams.get('no');
    if (!no || !/^\d+$/.test(no)) return null;
    return { kind: 'post', board, id, no, extra };
  }

  // Path form, with or without the leading `board` segment.
  const rest = segments[0] === 'board' ? segments.slice(1) : segments;
  const [id, no] = rest;
  if (!id || !/^[A-Za-z0-9_]+$/.test(id)) return null;
  if (rest.length === 1) return { kind: 'list', board, id, extra };
  if (rest.length === 2 && no && /^\d+$/.test(no)) return { kind: 'post', board, id, no, extra };
  return null;
}

/** The dcinside URL a target points at - what we fetch and where humans get redirected. */
export function buildDcUrl(target: Target): string {
  const prefix = BOARD_PREFIX[target.board];
  const page = target.kind === 'post' ? 'view' : 'lists';
  const url = new URL(`${DC_ORIGIN}${prefix}/board/${page}/`);
  url.searchParams.set('id', target.id);
  if (target.kind === 'post') url.searchParams.set('no', target.no);
  for (const [key, value] of Object.entries(target.extra)) url.searchParams.set(key, value);
  return url.toString();
}

/** Canonical URL without paging/search noise, for og:url and cache keys. */
export function canonicalDcUrl(target: Target): string {
  const bare: Target =
    target.kind === 'post'
      ? ({ ...target, extra: {} } satisfies PostTarget)
      : ({ ...target, extra: {} } satisfies ListTarget);
  return buildDcUrl(bare);
}
