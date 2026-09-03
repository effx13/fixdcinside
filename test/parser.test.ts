import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseList } from '../src/parser/list';
import { parsePost } from '../src/parser/post';
import type { ListTarget, PostTarget } from '../src/types';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

const guide: PostTarget = { kind: 'post', board: 'mgallery', id: 'itxbuild', no: '464460', extra: {} };
const walk: PostTarget = { kind: 'post', board: 'gall', id: 'walking', no: '9001', extra: {} };
const list: ListTarget = { kind: 'list', board: 'mgallery', id: 'itxbuild', extra: {} };

describe('parsePost - desktop layout', () => {
  const post = parsePost(fixture('desktop-post.html'), guide, 'https://example.test/post', 'desktop');

  it('separates the 말머리 from the title', () => {
    expect(post.title).toBe('ITX 케이스 입문 가이드');
    expect(post.headText).toBe('[정보]');
  });

  it('reads the gallery name without the minor-gallery badge', () => {
    expect(post.galleryName).toBe('조립 갤러리');
  });

  it('reads a logged-in (고정닉) author', () => {
    expect(post.author).toMatchObject({ nick: '쿨링덕후', uid: 'coolduck', fixed: true });
    expect(post.author.ip).toBeUndefined();
  });

  it('reads counters, including thousands separators', () => {
    expect(post.views).toBe(12048);
    expect(post.upvotes).toBe(132);
    expect(post.downvotes).toBe(4);
    expect(post.commentCount).toBe(47);
  });

  it('reads the timestamp as a real instant in KST', () => {
    expect(post.createdAt).toBe('2026-08-14T09:12:05+09:00');
  });

  it('flattens the body to plain text and drops inline scripts', () => {
    expect(post.text).toContain('쿨러 높이 제한');
    expect(post.text).toContain('SFX와 SFX-L');
    expect(post.text).not.toContain('var tracking');
    expect(post.text).not.toContain('<');
  });

  it('collects attachments in document order and classifies dccons', () => {
    expect(post.media.map((item) => item.kind)).toEqual(['image', 'image', 'dccon']);
    expect(post.media[0]?.url).toContain('viewimage.php');
    expect(post.media[1]).toMatchObject({ width: 800, height: 600 });
  });

  it('ignores the page chrome served from nstatic', () => {
    expect(post.media.some((item) => item.url.includes('nstatic.dcinside.com'))).toBe(false);
  });
});

describe('parsePost - anonymous writer', () => {
  const post = parsePost(
    fixture('desktop-post-anonymous.html'),
    walk,
    'https://example.test/post',
    'desktop',
  );

  it('keeps the IP fragment instead of a uid', () => {
    expect(post.author).toMatchObject({ nick: 'ㅇㅇ', ip: '211.246', fixed: false });
    expect(post.author.uid).toBeUndefined();
  });

  it('leaves 말머리 unset when the post has none', () => {
    expect(post.headText).toBeUndefined();
    expect(post.title).toBe('오늘 날씨 좋다');
  });

  it('handles a post with no attachments', () => {
    expect(post.media).toEqual([]);
    expect(post.text).toContain('강변 한 바퀴');
  });
});

describe('parsePost - mobile layout', () => {
  const post = parsePost(fixture('mobile-post.html'), guide, 'https://example.test/post', 'mobile');

  it('agrees with the desktop parser on title, 말머리 and author', () => {
    expect(post.title).toBe('ITX 케이스 입문 가이드');
    expect(post.headText).toBe('[정보]');
    expect(post.author).toMatchObject({ nick: '쿨링덕후', uid: 'coolduck', fixed: true });
  });

  it('resolves lazy-loaded images from data-original', () => {
    expect(post.media.map((item) => item.kind)).toEqual(['image', 'dccon']);
    expect(post.media[0]?.url).toContain('viewimage.php');
    expect(post.media.some((item) => item.url.includes('nstatic.dcinside.com'))).toBe(false);
  });

  it('reads the counters from the mobile markup', () => {
    expect(post.views).toBe(12048);
    expect(post.upvotes).toBe(132);
    expect(post.commentCount).toBe(47);
  });
});

describe('parseList', () => {
  const gallery = parseList(fixture('desktop-list.html'), list, 'https://example.test/list');

  it('reads the gallery name without the minor-gallery badge', () => {
    expect(gallery.galleryName).toBe('조립 갤러리');
  });

  it('drops the survey and ad rows dcinside injects', () => {
    expect(gallery.posts).toHaveLength(3);
    expect(gallery.posts.some((entry) => entry.title.includes('광고'))).toBe(false);
    expect(gallery.posts.some((entry) => entry.title.includes('설문'))).toBe(false);
  });

  it('flags notices separately from ordinary posts', () => {
    expect(gallery.posts.filter((entry) => entry.notice)).toHaveLength(1);
    expect(gallery.posts.filter((entry) => !entry.notice)).toHaveLength(2);
  });

  it('absolutises row links', () => {
    expect(gallery.posts.every((entry) => entry.url.startsWith('https://gall.dcinside.com/'))).toBe(true);
  });

  it('reads per-row author and counters', () => {
    const entry = gallery.posts.find((post) => post.no === '1042')!;
    expect(entry.title).toBe('ITX 케이스 입문 가이드');
    expect(entry.author).toMatchObject({ nick: '쿨링덕후', uid: 'coolduck', fixed: true });
    expect(entry).toMatchObject({ views: 12048, upvotes: 132, commentCount: 47, type: 'icon_pic' });
  });

  it('reads anonymous row authors', () => {
    const entry = gallery.posts.find((post) => post.no === '1041')!;
    expect(entry.author).toMatchObject({ nick: 'ㅇㅇ', ip: '118.235', fixed: false });
    expect(entry.commentCount).toBe(0);
  });
});
