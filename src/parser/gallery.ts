import type { CheerioAPI } from 'cheerio';
import { normalizeWhitespace } from './text';

/**
 * Read the gallery name from a page header.
 *
 * The heading carries a badge for minor/mini galleries whose screen-reader
 * label sits inside it, so a plain `.text()` yields "SFF 갤러리마이너". Drop the
 * badge before reading.
 */
export function readGalleryName($: CheerioAPI, fallback: string): string {
  const heading = $('.page_head h2 a').first();
  const source = heading.length ? heading : $('.fs_gallname').first();
  if (!source.length) return fallback;

  const cloned = source.clone();
  cloned.find('.blind, .pagehead_titicon, .sp_img, script, style').remove();
  return normalizeWhitespace(cloned.text()) || fallback;
}
