import { MAX_EMBED_DESCRIPTION } from '../constants';
import { encodeMediaUrl, isAllowedMediaUrl } from '../fetcher/media';
import { isContentMedia, pickCover } from '../parser/media';
import { truncate } from '../parser/text';
import type { GalleryList, Media, Post } from '../types';
import { escapeHtml } from '../util/html';
import { ICON_PNG_SIZES, renderListTemplate, renderPostTemplate } from './templates.generated';

/** Shows up as the coloured bar on the left of a Discord embed. */
const THEME_COLOR = '#3b4890';

export interface EmbedContext {
  env: Env;
  /** Origin of this worker, used to build proxy URLs. */
  origin: string;
  /** Hand Discord the Mastodon path instead of Open Graph media. See isDiscord. */
  activity: boolean;
}

/**
 * What the compiled templates call for `<%= %>` interpolation. Only primitives
 * are stringified - anything else would render as "[object Object]".
 */
const escapeFn = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return escapeHtml(value);
  if (typeof value === 'number' || typeof value === 'boolean') return escapeHtml(value.toString());
  return '';
};

/** Icon links, the set Discord looks through for the site row on an embed. */
function iconLinks(ctx: EmbedContext) {
  return {
    iconSvg: `${ctx.origin}/icon.svg`,
    iconIco: `${ctx.origin}/favicon.ico`,
    appleIcon: `${ctx.origin}/icon-64.png`,
    iconPngs: ICON_PNG_SIZES.map((size) => ({ size, url: `${ctx.origin}/icon-${size}.png` })),
  };
}

function proxied(ctx: EmbedContext, url: string): string {
  return `${ctx.origin}/media/${encodeMediaUrl(url)}`;
}

function formatAuthor(post: Post): string {
  if (post.author.fixed) return post.author.nick;
  return post.author.ip ? `${post.author.nick} (${post.author.ip})` : post.author.nick;
}

function statsLine(post: Post): string {
  const parts = [`👁️ ${post.views.toLocaleString('ko-KR')}`, `👍 ${post.upvotes.toLocaleString('ko-KR')}`];
  if (post.downvotes > 0) parts.push(`👎 ${post.downvotes.toLocaleString('ko-KR')}`);
  parts.push(`💬 ${post.commentCount.toLocaleString('ko-KR')}`);
  return parts.join('   ');
}

function description(post: Post): string {
  return truncate(post.text, MAX_EMBED_DESCRIPTION) || statsLine(post);
}

/**
 * Discord builds two lines from oEmbed: `author_name` becomes the line above
 * the title, and `provider_name` becomes the footer it pairs with a timestamp.
 * og:site_name alone gets neither, which is why everything worth showing has to
 * be routed through here.
 */
function oembedUrl(ctx: EmbedContext, author: string, title: string, url: string): string {
  const params = new URLSearchParams({ author, title, url });
  return `${ctx.origin}/oembed?${params.toString()}`;
}

/** The image a crawler will ask for next, if any - see prefetchMedia. */
export function embedCoverUrl(post: Post): string | undefined {
  return pickCover(post.media.filter((item) => isContentMedia(item) && isAllowedMediaUrl(item.url)))?.url;
}

export function renderPostEmbed(post: Post, ctx: EmbedContext): string {
  // Old posts sometimes hotlink images from other sites, which the proxy will
  // not serve. Advertising one produces a broken embed, so drop them here.
  const usable = post.media.filter((item) => isContentMedia(item) && isAllowedMediaUrl(item.url));
  const cover = pickCover(usable);
  const video: Media | undefined = cover?.kind === 'video' ? cover : undefined;
  // A video embed replaces the image card entirely, so only one of the two runs.
  const images = video ? [] : usable.filter((item) => item.kind === 'image' || item.kind === 'dccon');
  const lead = images[0];

  return renderPostTemplate(
    {
      url: post.url,
      title: post.title,
      description: description(post),
      siteName: ctx.env.BRAND_NAME,
      themeColor: THEME_COLOR,
      twitterCard: ctx.activity ? 'summary' : video ? 'player' : lead ? 'summary_large_image' : 'summary',
      video: ctx.activity
        ? undefined
        : video && {
            url: proxied(ctx, video.url),
            width: video.width ?? 1280,
            height: video.height ?? 720,
          },
      // Withheld from Discord on purpose: given an og:image it renders its own
      // link embed and never follows the activity link, and that embed has no
      // footer, no avatar and room for a single picture.
      images: ctx.activity ? [] : images.slice(0, 1).map((image) => proxied(ctx, image.url)),
      imageWidth: ctx.activity ? undefined : lead?.width,
      imageHeight: ctx.activity ? undefined : lead?.height,
      ...iconLinks(ctx),
      activity: ctx.activity,
      activityUrl: `${ctx.origin}/users/${post.board === 'gall' ? '' : `${post.board}.`}${post.galleryId}/statuses/${post.no}`,
      oembedUrl: oembedUrl(
        ctx,
        `${formatAuthor(post)} · ${post.galleryName} · ${statsLine(post)}`,
        post.title,
        post.url,
      ),
    },
    escapeFn,
  );
}

export function renderListEmbed(list: GalleryList, ctx: EmbedContext): string {
  const posts = list.posts.filter((entry) => !entry.notice).slice(0, 6);
  const lines = posts.map(
    (entry) => `· ${truncate(entry.title, 46)}  💬${entry.commentCount} 👍${entry.upvotes}`,
  );
  const noticeCount = list.posts.length - posts.length;

  return renderListTemplate(
    {
      url: list.url,
      title: list.galleryName,
      description: truncate(lines.join('\n'), 600) || `${list.galleryName}에 표시할 글이 없습니다.`,
      siteName: ctx.env.BRAND_NAME,
      themeColor: THEME_COLOR,
      ...iconLinks(ctx),
      oembedUrl: oembedUrl(
        ctx,
        `${list.galleryName} · 글 ${posts.length}개 · 공지 ${noticeCount}개`,
        list.galleryName,
        list.url,
      ),
    },
    escapeFn,
  );
}

export function renderOembed(params: URLSearchParams, env: Env): Record<string, unknown> {
  return {
    version: '1.0',
    // "rich" is what makes Discord render the provider as a footer.
    type: 'rich',
    title: params.get('title') ?? env.BRAND_NAME,
    author_name: params.get('author') ?? '',
    author_url: params.get('url') ?? `https://${env.BRAND_HOST}`,
    provider_name: env.BRAND_NAME,
    provider_url: env.REPO_URL,
  };
}
