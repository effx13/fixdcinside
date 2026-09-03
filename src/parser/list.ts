import * as cheerio from 'cheerio';
import type { GalleryList, ListEntry, ListTarget } from '../types';
import { readGalleryName } from './gallery';
import { ParseError } from './post';
import { normalizeWhitespace, parseCount } from './text';

const DC_BASE = 'https://gall.dcinside.com';

/**
 * Parse a gallery listing.
 *
 * Real posts are `tr.ub-content.us-post` rows carrying `data-no`; dcinside's
 * survey / interview / ad rows share the table but have none, so keying off
 * `data-no` drops them for free.
 */
export function parseList(html: string, target: ListTarget, url: string): GalleryList {
  const $ = cheerio.load(html);
  const rows = $('.gall_list tbody tr.ub-content[data-no]');
  if (rows.length === 0)
    throw new ParseError('gallery list not found - page layout changed or gallery is private');

  const posts: ListEntry[] = [];
  rows.each((_, node) => {
    const row = $(node);
    const no = row.attr('data-no');
    const link = row.find('.gall_tit a').first();
    const href = link.attr('href');
    const title = normalizeWhitespace(link.find('b').last().text() || link.text());
    if (!no || !href || !title) return;

    const writer = row.find('.gall_writer').first();
    const type = row.attr('data-type');
    posts.push({
      no,
      title,
      url: href.startsWith('http') ? href : `${DC_BASE}${href}`,
      author: {
        nick: normalizeWhitespace(writer.attr('data-nick') ?? writer.text()) || '익명',
        uid: writer.attr('data-uid') || undefined,
        ip: writer.attr('data-ip') || undefined,
        fixed: Boolean(writer.attr('data-uid')),
      },
      type,
      notice: type === 'icon_notice',
      views: parseCount(row.find('.gall_count').first().text()),
      upvotes: parseCount(row.find('.gall_recommend').first().text()),
      commentCount: parseCount(row.find('.reply_num').first().text()),
      createdAt: row.find('.gall_date').first().attr('title') ?? undefined,
    });
  });

  return {
    board: target.board,
    galleryId: target.id,
    galleryName: readGalleryName($, target.id),
    posts,
    url,
  };
}
