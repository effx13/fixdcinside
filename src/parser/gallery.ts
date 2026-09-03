import type { CheerioAPI } from 'cheerio';
import { normalizeWhitespace } from './text';

/**
 * Read the gallery name from a page header.
 *
 * The heading of a minor/mini/person gallery carries a badge whose
 * screen-reader label ("마이너") sits inside the anchor, so a plain `.text()`
 * yields "SFF 갤러리마이너". Pull the badge out and fold it back into the name
 * where it belongs, giving "SFF 마이너 갤러리".
 */
export function readGalleryName($: CheerioAPI, fallback: string): string {
  const heading = $('.page_head h2 a').first();
  const source = heading.length ? heading : $('.fs_gallname').first();
  if (!source.length) return fallback;

  const badge = normalizeWhitespace(source.find('.pagehead_titicon .blind').first().text());

  const cloned = source.clone();
  cloned.find('.blind, .pagehead_titicon, .sp_img, script, style').remove();
  const name = normalizeWhitespace(cloned.text());
  if (!name) return fallback;

  return badge && !name.includes(badge) ? name.replace(/갤러리$/, `${badge} 갤러리`) : name;
}
