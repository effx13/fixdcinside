import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePost } from '../src/parser/post';
import { renderActivity } from '../src/render/activity';
import type { PostTarget } from '../src/types';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const target: PostTarget = { kind: 'post', board: 'mgallery', id: 'itxbuild', no: '464460', extra: {} };

const post = parsePost(
  fixture('desktop-post.html'),
  target,
  'https://gall.dcinside.com/mgallery/board/view/?id=itxbuild&no=464460',
  'desktop',
);
const activity = renderActivity(post, 'https://fixdcinside.com', 'FixDcinside') as Record<string, never>;

describe('renderActivity', () => {
  it('describes the writer, not the gallery, as the account', () => {
    const account = activity.account as unknown as Record<string, unknown>;
    expect(account.display_name).toBe('쿨링덕후');
    // Handles are handles: a Korean nickname with spaces is not one.
    expect(account.acct).toBe('coolduck');
    expect(account.username).toBe('coolduck');
  });

  it('stamps the time as UTC, the way a Mastodon client expects', () => {
    expect(activity.created_at as unknown as string).toMatch(/Z$/);
  });

  it('carries the counters in the content rather than in the count fields', () => {
    // Discord renders replies_count and favourites_count as its own rows, which
    // would repeat what the content already says.
    expect(activity.replies_count as unknown as number).toBe(0);
    expect(activity.favourites_count as unknown as number).toBe(0);
    expect(activity.reblogs_count as unknown as number).toBe(0);
    expect(activity.content as unknown as string).toContain('👁️ 12,048');
    expect(activity.content as unknown as string).toContain('💬 47');
  });

  it('leads the content with the post title', () => {
    expect(activity.content as unknown as string).toMatch(/^<p><b>ITX 케이스 입문 가이드<\/b><\/p>/);
  });

  it('proxies every attachment and never captions them', () => {
    const media = activity.media_attachments as unknown as { url: string; description: null }[];
    expect(media.length).toBeGreaterThan(1);
    expect(media.every((item) => item.url.startsWith('https://fixdcinside.com/media/'))).toBe(true);
    // dcinside stores its own file hash in alt; it is not a caption.
    expect(media.every((item) => item.description === null)).toBe(true);
  });
});
