import { isContentMedia } from '../parser/media';
import { isAllowedMediaUrl } from '../fetcher/media';
import { encodeMediaUrl } from '../fetcher/media';
import type { Post } from '../types';
import { escapeHtml } from '../util/html';

/**
 * A Mastodon API v1 status, which is what Discord fetches when a page offers
 * an `application/activity+json` alternate link.
 *
 * This is the whole reason the embed looks the way it does. Discord's ordinary
 * link embed puts the site name at the top as a provider and has no room for
 * an avatar, a timestamp, or more than one image. Its Mastodon renderer has
 * all four: author with avatar, the text, every attachment, and a footer
 * carrying the site icon, name and time. FxEmbed does exactly this - their
 * source calls it "convince Discord that you are actually a Mastodon link".
 */
interface ActivityAttachment {
  id: string;
  type: 'image' | 'video';
  url: string;
  preview_url: string | null;
  remote_url: null;
  preview_remote_url: null;
  text_url: null;
  description: string | null;
  /** Omitted when dcinside gives no dimensions; better absent than invented. */
  meta?: { original: { width: number; height: number } };
}

function attachments(post: Post, origin: string): ActivityAttachment[] {
  return post.media
    .filter((item) => isContentMedia(item) && isAllowedMediaUrl(item.url))
    .slice(0, 4)
    .map((item, index) => ({
      id: `${post.no}${index}`,
      type: item.kind === 'video' ? ('video' as const) : ('image' as const),
      url: `${origin}/media/${encodeMediaUrl(item.url)}`,
      preview_url: item.thumbnail ? `${origin}/media/${encodeMediaUrl(item.thumbnail)}` : null,
      remote_url: null,
      preview_remote_url: null,
      text_url: null,
      description: item.alt ?? null,
      ...(item.width && item.height
        ? { meta: { original: { width: item.width, height: item.height } } }
        : {}),
    }));
}

/** Mastodon content is HTML, and this is where the counters live - Discord has no field for them. */
function content(post: Post): string {
  const paragraphs = post.text
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`);

  const stats = [
    `👁️ ${post.views.toLocaleString('ko-KR')}`,
    `👍 ${post.upvotes.toLocaleString('ko-KR')}`,
    ...(post.downvotes > 0 ? [`👎 ${post.downvotes.toLocaleString('ko-KR')}`] : []),
    `💬 ${post.commentCount.toLocaleString('ko-KR')}`,
  ].join('   ');

  return [`<p><b>${escapeHtml(post.title)}</b></p>`, ...paragraphs, `<p>${stats}</p>`].join('');
}

/** A Mastodon-shaped handle; the writer's nickname stays in display_name. */
function handle(post: Post): string {
  const raw = post.author.uid ?? post.galleryId;
  return raw.replace(/[^A-Za-z0-9_.-]/g, '') || post.galleryId;
}

function displayName(post: Post): string {
  if (post.author.fixed) return post.author.nick;
  return post.author.ip ? `${post.author.nick} (${post.author.ip})` : post.author.nick;
}

export function renderActivity(post: Post, origin: string, brand: string): Record<string, unknown> {
  // Mastodon timestamps are UTC with a Z; an offset is valid ISO 8601 but is
  // not what a client parsing this expects to see.
  const created = new Date(post.createdAt ?? Date.now()).toISOString();
  const galleryUrl = post.url.replace(/\/board\/view\/.*$/, `/board/lists/?id=${post.galleryId}`);

  return {
    id: post.no,
    url: post.url,
    uri: post.url,
    created_at: created,
    edited_at: null,
    reblog: null,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    language: 'ko',
    content: content(post),
    spoiler_text: '',
    visibility: 'public',
    application: { name: brand, website: null },
    media_attachments: attachments(post, origin),
    account: {
      id: post.author.uid ?? post.galleryId,
      // Mastodon usernames are handles, not display names: a Korean nickname
      // with spaces belongs in display_name and nowhere else.
      display_name: displayName(post),
      username: handle(post),
      acct: handle(post),
      url: galleryUrl,
      uri: galleryUrl,
      created_at: created,
      locked: false,
      bot: false,
      discoverable: true,
      indexable: false,
      group: false,
      avatar: `${origin}/icon-64.png`,
      avatar_static: `${origin}/icon-64.png`,
      header: `${origin}/icon-64.png`,
      header_static: `${origin}/icon-64.png`,
      followers_count: 0,
      following_count: 0,
      statuses_count: 0,
      hide_collections: false,
      noindex: false,
      emojis: [],
      roles: [],
      fields: [],
    },
    mentions: [],
    tags: [],
    emojis: [],
    card: null,
    poll: null,
    replies_count: post.commentCount,
    reblogs_count: 0,
    favourites_count: post.upvotes,
  };
}
