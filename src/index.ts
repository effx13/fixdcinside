import { Hono } from 'hono';
import { withCache } from './cache';
import { LIST_CACHE_TTL, POST_CACHE_TTL } from './constants';
import { DcFetchError, fetchPage } from './fetcher/dcinside';
import { decodeMediaUrl, prefetchMedia, proxyMedia } from './fetcher/media';
import { parseList } from './parser/list';
import { ParseError, parsePost } from './parser/post';
import { buildDcUrl, canonicalDcUrl, parseTarget } from './parser/url';
import { renderActivity } from './render/activity';
import {
  embedCoverUrl,
  renderListEmbed,
  renderOembed,
  renderPostEmbed,
  type EmbedContext,
} from './render/embed';
import { FAVICON_ICO_BASE64, ICON_PNG_BASE64, ICON_PNG_SIZES, ICON_SVG } from './render/templates.generated';
import type { GalleryList, Post, Target } from './types';
import { isBot } from './util/bots';

const app = new Hono<{ Bindings: Env }>();

/** `mgallery.sff` -> ['mgallery', 'sff']; a bare id means a main gallery. */
function splitHandle(handle: string): [string, string] {
  const separator = handle.indexOf('.');
  if (separator < 0) return ['board', handle];
  return [handle.slice(0, separator), handle.slice(separator + 1)];
}

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=60, s-maxage=120',
  // This URL answers crawlers with embed markup and humans with a redirect, so
  // a shared cache must not hand one audience the other's response.
  Vary: 'User-Agent',
};

/** Resolve a target all the way to parsed data, going through the KV cache. */
async function resolve(
  target: Target,
  env: Env,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<{ value: Post | GalleryList; hit: boolean }> {
  const dcUrl = buildDcUrl(target);
  const ttl = target.kind === 'post' ? POST_CACHE_TTL : LIST_CACHE_TTL;

  return withCache(env, target.kind, dcUrl, { ttl, waitUntil }, async () => {
    const { html, layout } = await fetchPage(target, dcUrl);
    return target.kind === 'post'
      ? parsePost(html, target, canonicalDcUrl(target), layout)
      : parseList(html, target, dcUrl);
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof DcFetchError) {
    const status = error.status === 404 ? 404 : 502;
    return new Response(`디시인사이드에서 글을 가져오지 못했습니다 (${error.status}).`, { status });
  }
  if (error instanceof ParseError) {
    return new Response('글을 해석하지 못했습니다. 삭제되었거나 접근이 제한된 글일 수 있습니다.', {
      status: 404,
    });
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new Response('디시인사이드 응답이 너무 느립니다.', { status: 504 });
  }
  return new Response('알 수 없는 오류가 발생했습니다.', { status: 500 });
}

/** Nothing to serve at the root - send people to the project page. */
app.get('/', (c) => c.redirect(c.env.REPO_URL, 302));

/** Decoded once per isolate rather than on every request. */
const decode = (base64: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

const FAVICON_ICO = decode(FAVICON_ICO_BASE64);
const ICON_PNGS = new Map(
  ICON_PNG_SIZES.map((size) => [String(size), decode(ICON_PNG_BASE64[String(size)] ?? '')]),
);

app.get('/favicon.ico', (c) =>
  c.body(FAVICON_ICO, 200, {
    'Content-Type': 'image/x-icon',
    'Cache-Control': 'public, max-age=86400',
  }),
);

/** Discord wants a bitmap icon for the site row on an embed. */
for (const size of ICON_PNG_SIZES) {
  const png = ICON_PNGS.get(String(size));
  if (!png) continue;
  app.get(`/icon-${size}.png`, (c) =>
    c.body(png, 200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    }),
  );
}

app.get('/icon.svg', (c) =>
  c.body(ICON_SVG, 200, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
  }),
);

app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /media/\nAllow: /\n'));

app.get('/oembed', (c) =>
  c.json(renderOembed(new URL(c.req.url).searchParams, c.env), 200, {
    'Cache-Control': 'public, max-age=3600',
  }),
);

/**
 * The Mastodon-style status Discord fetches from the activity+json alternate
 * link on a post page. Everything the embed shows - the avatar, every image,
 * and the footer with icon, name and timestamp - comes from here rather than
 * from the Open Graph tags.
 */
app.get('/users/:handle/statuses/:no', async (c) => {
  const [board, id] = splitHandle(c.req.param('handle') ?? '');
  const url = new URL(c.req.url);
  const target = parseTarget(
    new URL(`${url.origin}/${board}/board/view/?id=${encodeURIComponent(id)}&no=${c.req.param('no')}`),
  );
  if (!target || target.kind !== 'post') return c.notFound();

  try {
    const { value } = await resolve(target, c.env, c.executionCtx.waitUntil.bind(c.executionCtx));
    return c.json(renderActivity(value as Post, url.origin, c.env.BRAND_NAME), 200, {
      'Content-Type': 'application/activity+json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** Proxy dcinside media, adding the Referer that its hotlink check requires. */
app.get('/media/:token', async (c) => {
  const url = decodeMediaUrl(c.req.param('token'));
  if (!url) return c.text('bad media token', 400);
  return proxyMedia(url, c.req.raw, c.executionCtx.waitUntil.bind(c.executionCtx));
});

/** JSON view of anything the embed routes can render. */
app.get('/api/*', async (c) => {
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/^\/api/, '') || '/';
  const target = parseTarget(url);
  if (!target) return c.json({ error: 'unsupported dcinside url' }, 400);

  try {
    const { value, hit } = await resolve(target, c.env, c.executionCtx.waitUntil.bind(c.executionCtx));
    return c.json({ ok: true, kind: target.kind, data: value }, 200, {
      'Cache-Control': 'public, max-age=60',
      'Access-Control-Allow-Origin': '*',
      'X-Cache': hit ? 'HIT' : 'MISS',
    });
  } catch (error) {
    const response = errorResponse(error);
    return c.json({ ok: false, error: await response.text() }, response.status as 400);
  }
});

/**
 * Everything else is treated as a mirrored dcinside URL: crawlers get embed
 * markup, humans get bounced to the real page.
 */
app.get('*', async (c) => {
  const url = new URL(c.req.url);
  const target = parseTarget(url);
  if (!target) return c.notFound();

  const dcUrl = buildDcUrl(target);
  if (!isBot(c.req.header('User-Agent'))) {
    return c.redirect(dcUrl, 302);
  }

  const ctx: EmbedContext = { env: c.env, origin: url.origin };
  const waitUntil = c.executionCtx.waitUntil.bind(c.executionCtx);
  try {
    const { value, hit } = await resolve(target, c.env, waitUntil);

    let html: string;
    if (target.kind === 'post') {
      const post = value as Post;
      html = renderPostEmbed(post, ctx);
      // The crawler asks for og:image right after this response. Start pulling
      // it now so that request lands on a warm cache instead of a 4s origin.
      const cover = embedCoverUrl(post);
      if (cover) waitUntil(prefetchMedia(cover));
    } else {
      html = renderListEmbed(value as GalleryList, ctx);
    }

    return c.html(html, 200, { ...HTML_HEADERS, 'X-Cache': hit ? 'HIT' : 'MISS' });
  } catch (error) {
    return errorResponse(error);
  }
});

app.notFound((c) => c.text('지원하지 않는 주소입니다.', 404));

export default app;
