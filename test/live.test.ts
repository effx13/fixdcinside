import { describe, expect, it } from 'vitest';
import { fetchPage } from '../src/fetcher/dcinside';
import { parseList } from '../src/parser/list';
import { parsePost } from '../src/parser/post';
import { buildDcUrl, parseTarget } from '../src/parser/url';
import type { ListTarget, PostTarget } from '../src/types';

/**
 * Opt-in smoke tests against the live site: `LIVE=1 pnpm test`.
 *
 * The committed fixtures are synthetic, so they cannot tell us when dcinside
 * changes its markup. These can - run them when a parser starts returning
 * empty fields in production. They are skipped by default so CI stays offline
 * and deterministic.
 */
const live = process.env.LIVE === '1' ? describe : describe.skip;

const at = (path: string) => parseTarget(new URL(`https://fixdcinside.com${path}`))!;

live('live dcinside', () => {
  it('parses a notice post from a main gallery', { timeout: 30_000 }, async () => {
    const target = at('/board/view/?id=cat&no=1958907') as PostTarget;
    const { html, layout } = await fetchPage(target, buildDcUrl(target));
    const post = parsePost(html, target, buildDcUrl(target), layout);

    expect(post.title.length).toBeGreaterThan(0);
    expect(post.galleryName).not.toMatch(/마이너|미니/); // badge text must not leak in
    expect(post.author.nick.length).toBeGreaterThan(0);
    expect(post.views).toBeGreaterThan(0);
    expect(post.text.length).toBeGreaterThan(0);
    expect(post.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('parses a minor gallery listing', { timeout: 30_000 }, async () => {
    const target = at('/mgallery/board/lists/?id=sff') as ListTarget;
    const { html } = await fetchPage(target, buildDcUrl(target));
    const list = parseList(html, target, buildDcUrl(target));

    expect(list.posts.length).toBeGreaterThan(10);
    expect(list.galleryName.length).toBeGreaterThan(0);
    expect(list.posts.every((entry) => /^\d+$/.test(entry.no))).toBe(true);
  });
});
