import { MAX_EMBED_DESCRIPTION } from '../constants';
import { encodeMediaUrl } from '../fetcher/media';
import { pickCover } from '../parser/media';
import { truncate } from '../parser/text';
import type { GalleryList, Media, Post } from '../types';
import { escapeHtml } from '../util/html';
import { renderListTemplate, renderPostTemplate } from './templates.generated';

/** Shows up as the coloured bar on the left of a Discord embed. */
const THEME_COLOR = '#3b4890';

export interface EmbedContext {
  env: Env;
  /** Origin of this worker, used to build proxy URLs. */
  origin: string;
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

function proxied(ctx: EmbedContext, url: string): string {
  return `${ctx.origin}/media/${encodeMediaUrl(url)}`;
}

function formatAuthor(post: Post): string {
  if (post.author.fixed) return post.author.nick;
  return post.author.ip ? `${post.author.nick} (${post.author.ip})` : post.author.nick;
}

function statsLine(post: Post): string {
  const parts = [`👁 ${post.views.toLocaleString('ko-KR')}`, `👍 ${post.upvotes.toLocaleString('ko-KR')}`];
  if (post.downvotes > 0) parts.push(`👎 ${post.downvotes.toLocaleString('ko-KR')}`);
  parts.push(`💬 ${post.commentCount.toLocaleString('ko-KR')}`);
  return parts.join('   ');
}

function description(post: Post): string {
  return truncate(post.text, MAX_EMBED_DESCRIPTION) || statsLine(post);
}

/**
 * Discord reads oEmbed to fill the two small lines above the embed title, and
 * its provider line *overrides* og:site_name - so the gallery has to be stated
 * here or it never shows up at all.
 */
function oembedUrl(ctx: EmbedContext, author: string, provider: string, url: string): string {
  const params = new URLSearchParams({ author, provider, url });
  return `${ctx.origin}/oembed?${params.toString()}`;
}

export function renderPostEmbed(post: Post, ctx: EmbedContext): string {
  const cover = pickCover(post.media);
  const video: Media | undefined = cover?.kind === 'video' ? cover : undefined;
  // A video embed replaces the image card entirely, so only one of the two runs.
  const images = video ? [] : post.media.filter((item) => item.kind === 'image' || item.kind === 'dccon');
  const lead = images[0];

  return renderPostTemplate(
    {
      type: video ? 'video.other' : 'article',
      url: post.url,
      title: post.title,
      description: description(post),
      siteName: `${ctx.env.BRAND_NAME} · ${post.galleryName}`,
      author: formatAuthor(post),
      publishedTime: post.createdAt,
      themeColor: THEME_COLOR,
      twitterCard: video ? 'player' : lead ? 'summary_large_image' : 'summary',
      video: video && {
        url: proxied(ctx, video.url),
        width: video.width ?? 1280,
        height: video.height ?? 720,
      },
      // Discord shows only the first; Mastodon and Telegram vary, so list a few.
      images: images.slice(0, 4).map((image) => proxied(ctx, image.url)),
      imageWidth: lead?.width,
      imageHeight: lead?.height,
      oembedUrl: oembedUrl(ctx, formatAuthor(post), `${post.galleryName} · ${statsLine(post)}`, post.url),
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
      siteName: `${ctx.env.BRAND_NAME} · 갤러리`,
      themeColor: THEME_COLOR,
      oembedUrl: oembedUrl(
        ctx,
        `${list.galleryName} (${list.galleryId})`,
        `${list.galleryName} · 글 ${posts.length}개 · 공지 ${noticeCount}개`,
        list.url,
      ),
    },
    escapeFn,
  );
}

export function renderOembed(params: URLSearchParams, env: Env): Record<string, unknown> {
  return {
    version: '1.0',
    type: 'link',
    author_name: params.get('author') ?? '',
    author_url: params.get('url') ?? '',
    provider_name: params.get('provider') ?? env.BRAND_NAME,
    provider_url: params.get('url') ?? `https://${env.BRAND_HOST}`,
  };
}
