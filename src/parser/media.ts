import type { Cheerio, CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import type { Media } from '../types';

function absolute(url: string | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:')) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice(7)}`;
  return trimmed.startsWith('https://') ? trimmed : null;
}

function dimension(value: string | undefined): number | undefined {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Pull media out of a post body in document order.
 *
 * dcinside uses four shapes:
 *   - photos:   <img src="//dcimgN.dcinside.co.kr/viewimage.php?...">
 *   - dccons:   <img class="written_dccon"> or <video class="written_dccon">
 *   - videos:   <video><source src="...mp4"></video>, sometimes only in an
 *               inline onmousedown handler
 *   - embeds:   <iframe src="youtube/...">
 */
export function extractMedia($: CheerioAPI, body: Cheerio<Element>): Media[] {
  const media: Media[] = [];
  const seen = new Set<string>();

  const push = (item: Media | null): void => {
    if (!item || seen.has(item.url)) return;
    seen.add(item.url);
    media.push(item);
  };

  body.find('img, video, iframe').each((_, node) => {
    const el = $(node);
    const tag = node.tagName.toLowerCase();
    const isDccon =
      (el.attr('class') ?? '').includes('dccon') || (el.attr('src') ?? '').includes('dccon.php');

    if (tag === 'iframe') {
      push(embedFrom(absolute(el.attr('src'))));
      return;
    }

    if (tag === 'video') {
      const src =
        absolute(el.attr('data-original')) ??
        absolute(el.attr('src')) ??
        absolute(el.find('source').first().attr('src')) ??
        mp4FromHandler(el.attr('onmousedown'));
      push(
        src
          ? {
              kind: isDccon ? 'dccon' : 'video',
              url: src,
              thumbnail: absolute(el.attr('poster')) ?? undefined,
              width: dimension(el.attr('width')),
              height: dimension(el.attr('height')),
            }
          : null,
      );
      return;
    }

    // The mobile layout lazy-loads images: `src` holds an nstatic placeholder
    // and the real URL sits in `data-original`.
    const src =
      absolute(el.attr('data-original')) ?? absolute(el.attr('data-src')) ?? absolute(el.attr('src'));
    // Layout spacers and UI sprites live on nstatic; they are never post content.
    if (!src || src.includes('nstatic.dcinside.com')) return;
    push({
      kind: isDccon ? 'dccon' : 'image',
      url: src,
      width: dimension(el.attr('width')),
      height: dimension(el.attr('height')),
      alt: el.attr('alt') || undefined,
    });
  });

  return media;
}

/** dcinside hides the real mp4 in `mp4_overlay_dccon(this, 'https://...mp4')`. */
function mp4FromHandler(handler: string | undefined): string | null {
  const match = handler?.match(/https?:\/\/[^'"\s)]+/);
  return match ? absolute(match[0]) : null;
}

function embedFrom(url: string | null): Media | null {
  if (!url) return null;
  if (!/youtube\.com|youtu\.be|dailymotion|vimeo|tv\.naver|dcinside/.test(url)) return null;
  return { kind: 'embed', url };
}

/**
 * Is this an actual attachment rather than page furniture?
 *
 * Uploads always go through `viewimage.php` (photos) or `dccon.php`
 * (stickers). Anything else on a dcinside host is chrome - most importantly
 * `_upload/img/noimage.gif`, the 154-byte placeholder dcinside substitutes for
 * an attachment it can no longer serve. Advertising that as og:image gives a
 * crawler a broken-looking tile.
 */
export function isContentMedia(media: Media): boolean {
  return /\/(viewimage|dccon)\.php/.test(media.url);
}

/** Bigger is better when dcinside tells us the size; ties keep document order. */
function area(media: Media): number {
  return media.width && media.height ? media.width * media.height : 0;
}

/**
 * The image an embed should lead with: a real photo beats a sticker, and a
 * known-large photo beats a decorative banner that happens to come first.
 */
export function pickCover(media: Media[]): Media | undefined {
  const content = media.filter(isContentMedia);
  const photos = content.filter((item) => item.kind === 'image');
  const largest = [...photos].sort((a, b) => area(b) - area(a))[0];
  if (largest && area(largest) > 0) return largest;
  return photos[0] ?? content.find((item) => item.kind === 'video') ?? content[0];
}
