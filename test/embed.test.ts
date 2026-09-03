import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeMediaUrl, encodeMediaUrl, isAllowedMediaUrl } from '../src/fetcher/media';
import { parseList } from '../src/parser/list';
import { parsePost } from '../src/parser/post';
import { truncate } from '../src/parser/text';
import { renderListEmbed, renderPostEmbed, type EmbedContext } from '../src/render/embed';
import type { ListTarget, PostTarget } from '../src/types';
import { isBot } from '../src/util/bots';
import { escapeHtml } from '../src/util/html';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const env: Env = {
  BRAND_NAME: 'fixdcinside',
  BRAND_HOST: 'fixdcinside.com',
  REPO_URL: 'https://github.com/effx13/fixdcinside',
  // Rendering never touches KV; the cache is exercised through the Worker.
  CACHE: undefined as unknown as KVNamespace,
};
const ctx: EmbedContext = { env, origin: 'https://fixdcinside.com' };

const guide: PostTarget = { kind: 'post', board: 'mgallery', id: 'itxbuild', no: '464460', extra: {} };
const walk: PostTarget = { kind: 'post', board: 'gall', id: 'walking', no: '9001', extra: {} };
const list: ListTarget = { kind: 'list', board: 'mgallery', id: 'itxbuild', extra: {} };

/** The oEmbed link's query, decoded - this is what Discord fetches. */
function oembedParams(html: string): URLSearchParams {
  const query = html.split('/oembed?')[1]?.split('"')[0] ?? '';
  return new URLSearchParams(query.replaceAll('&amp;', '&'));
}

const post = parsePost(
  fixture('desktop-post.html'),
  guide,
  'https://gall.dcinside.com/mgallery/board/view/?id=itxbuild&no=464460',
  'desktop',
);

describe('renderPostEmbed', () => {
  const html = renderPostEmbed(post, ctx);

  it('emits the Open Graph tags a crawler needs', () => {
    expect(html).toContain('<meta property="og:title" content="ITX 케이스 입문 가이드">');
    expect(html).toContain('og:url');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it('routes images through the proxy rather than linking dcinside directly', () => {
    const images = [...html.matchAll(/property="og:image" content="([^"]+)"/g)].map((match) => match[1]);
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((url) => url?.startsWith('https://fixdcinside.com/media/'))).toBe(true);
    expect(html).not.toContain('dcimg6.dcinside.co.kr');
  });

  it('proxy links decode back to the original dcinside url', () => {
    const token = html.match(/\/media\/([A-Za-z0-9_-]+)"/)?.[1];
    expect(decodeMediaUrl(token!)).toBe(post.media[0]?.url);
  });

  it('puts the author and stats in the oEmbed link', () => {
    expect(html).toContain('type="application/json+oembed"');
    expect(html).toContain(encodeURIComponent('쿨링덕후'));
  });

  it('sends humans on to dcinside if they land on the embed page', () => {
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain(escapeHtml(post.url));
  });

  it('keeps the description to the post body, with no attachment badges', () => {
    const description = html.match(/property="og:description" content="([^"]+)"/s)?.[1];
    expect(description).toContain('쿨러 높이 제한');
    expect(description).not.toMatch(/이미지 d+장/);
    expect(description).not.toMatch(/동영상 d+개/);
  });

  it('names the gallery in the oEmbed provider, which Discord shows above the title', () => {
    // Discord's provider line overrides og:site_name, so the gallery has to be here.
    expect(oembedParams(html).get('provider')).toMatch(/^조립 마이너 갤러리 · /);
    // og:site_name is the fallback for platforms that ignore oEmbed.
    expect(html).toContain('content="fixdcinside · 조립 마이너 갤러리"');
  });

  it('still carries the counters alongside the gallery', () => {
    expect(oembedParams(html).get('provider')).toContain('12,048');
    expect(oembedParams(html).get('author')).toBe('쿨링덕후');
  });

  it('escapes markup from post content', () => {
    const hostile = { ...post, title: '<script>alert(1)</script>' };
    const rendered = renderPostEmbed(hostile, ctx);
    expect(rendered).not.toContain('<script>alert(1)</script>');
    expect(rendered).toContain('&lt;script&gt;');
  });

  it('falls back to a plain summary card for a post with no media', () => {
    const textOnly = parsePost(
      fixture('desktop-post-anonymous.html'),
      walk,
      'https://example.test/p',
      'desktop',
    );
    const rendered = renderPostEmbed(textOnly, ctx);
    expect(rendered).toContain('<meta name="twitter:card" content="summary">');
    expect(rendered).not.toContain('og:image');
  });
});

describe('renderListEmbed', () => {
  const gallery = parseList(fixture('desktop-list.html'), list, 'https://example.test/list');
  const html = renderListEmbed(gallery, ctx);

  it('titles the embed after the gallery', () => {
    expect(html).toContain('og:title');
    expect(html).toContain('조립');
  });

  it('summarises ordinary posts and leaves notices out', () => {
    expect(html).toContain('ITX 케이스 입문 가이드');
    expect(html).not.toContain('갤러리 이용 안내');
  });

  it('names the gallery in the oEmbed provider', () => {
    expect(oembedParams(html).get('provider')).toMatch(/^조립 마이너 갤러리 · /);
  });
});

describe('media proxy helpers', () => {
  it('round-trips URLs through a URL-safe token', () => {
    const url = 'https://dcimg6.dcinside.co.kr/viewimage.php?id=a&no=b+c/d';
    const token = encodeMediaUrl(url);
    expect(token).not.toMatch(/[+/=]/);
    expect(decodeMediaUrl(token)).toBe(url);
  });

  it('rejects a malformed token instead of throwing', () => {
    expect(decodeMediaUrl('!!!not base64!!!')).toBeNull();
  });

  it('only proxies dcinside hosts, so it cannot be used as an open proxy', () => {
    expect(isAllowedMediaUrl('https://dcimg6.dcinside.co.kr/viewimage.php?id=a')).toBe(true);
    expect(isAllowedMediaUrl('https://dcimg5.dcinside.com/dccon.php?no=1')).toBe(true);
    expect(isAllowedMediaUrl('https://evil.example.com/payload.bin')).toBe(false);
    expect(isAllowedMediaUrl('https://dcinside.co.kr.evil.example.com/x')).toBe(false);
    expect(isAllowedMediaUrl('http://dcimg6.dcinside.co.kr/x')).toBe(false);
    expect(isAllowedMediaUrl('not a url')).toBe(false);
  });
});

describe('isBot', () => {
  it('recognises the crawlers that render link previews', () => {
    expect(isBot('Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)')).toBe(true);
    expect(isBot('TelegramBot (like TwitterBot)')).toBe(true);
    expect(isBot('Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)')).toBe(true);
    expect(isBot(null)).toBe(true);
  });

  it('treats real browsers as humans', () => {
    expect(
      isBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'),
    ).toBe(false);
    expect(
      isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1'),
    ).toBe(false);
  });
});

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('짧은 글', 20)).toBe('짧은 글');
  });

  it('cuts on a word boundary and marks the cut', () => {
    const result = truncate('one two three four five six seven', 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.endsWith('…')).toBe(true);
  });
});
