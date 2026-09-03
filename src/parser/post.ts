import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { Author, Post, PostTarget } from '../types';
import { readGalleryName } from './gallery';
import { extractMedia } from './media';
import { htmlToText, normalizeWhitespace, parseCount } from './text';

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/** dcinside prints wall-clock Seoul time; pin the offset so consumers get a real instant. */
function toIso(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T]+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s ?? '00'}+09:00`;
}

function authorFrom(nick: string, uid: string | undefined, ip: string | undefined): Author {
  return {
    nick: nick.trim() || '익명',
    uid: uid?.trim() || undefined,
    ip: ip?.trim() || undefined,
    fixed: Boolean(uid?.trim()),
  };
}

export function parsePost(html: string, target: PostTarget, url: string, layout: 'desktop' | 'mobile'): Post {
  const $ = cheerio.load(html);
  return layout === 'mobile' ? parseMobile($, target, url) : parseDesktop($, target, url);
}

function parseDesktop($: CheerioAPI, target: PostTarget, url: string): Post {
  const head = $('.gallview_head').first();
  const title = normalizeWhitespace(head.find('.title_subject').first().text());
  if (!title) throw new ParseError('post title not found - page layout changed or post was deleted');

  const writer = head.find('.gall_writer').first();
  const body = $('.write_div').first();

  const headText = normalizeWhitespace(head.find('.title_headtext').first().text()) || undefined;

  const root = body[0];
  const media = root ? extractMedia($, body) : [];
  const text = root ? htmlToText(root) : '';

  return {
    board: target.board,
    galleryId: target.id,
    galleryName: readGalleryName($, target.id),
    no: target.no,
    title,
    headText,
    author: authorFrom(writer.attr('data-nick') ?? '', writer.attr('data-uid'), writer.attr('data-ip')),
    createdAt: toIso(head.find('.gall_date').first().attr('title') ?? head.find('.gall_date').first().text()),
    views: parseCount(head.find('.gall_count').first().text()),
    upvotes: parseCount(
      $(`#recommend_view_up_${target.no}`).first().text() || head.find('.gall_reply_num').first().text(),
    ),
    downvotes: parseCount($(`#recommend_view_down_${target.no}`).first().text()),
    commentCount: parseCount(head.find('.gall_comment').first().text()),
    text,
    media,
    url,
  };
}

function parseMobile($: CheerioAPI, target: PostTarget, url: string): Post {
  const head = $('.gallview-tit-box').first();
  const raw = normalizeWhitespace(head.find('.tit').first().text());
  if (!raw) throw new ParseError('post title not found - page layout changed or post was deleted');

  // The mobile layout folds 말머리 into the title span: "[일반] 제목".
  const headMatch = raw.match(/^(\[[^\]]{1,12}\])\s*(.*)$/s);
  const headText = headMatch?.[1];
  const title = headMatch?.[2]?.trim() || raw;

  const info = head.find('.ginfo2 li');
  const gallog = head.find('a[href^="/gallog/"]').first().attr('href');
  const body = $('.thum-txtin').first();

  const root = body[0];
  const media = root ? extractMedia($, body) : [];

  return {
    board: target.board,
    galleryId: target.id,
    galleryName: normalizeWhitespace($('.gnb-gall-tit, .tit-gall').first().text()) || target.id,
    no: target.no,
    title,
    headText,
    author: authorFrom(
      normalizeWhitespace(head.find('.nick').first().text()),
      gallog?.replace('/gallog/', ''),
      normalizeWhitespace(head.find('.ip').first().text()).replace(/[()]/g, '') || undefined,
    ),
    createdAt: toIso(info.eq(1).text()),
    views: parseCount($('.ginfo2 li:contains("조회")').first().text()),
    upvotes: parseCount($('.recomm-list .up_num, .btn_recom_up .num').first().text()),
    downvotes: parseCount($('.recomm-list .down_num, .btn_recom_down .num').first().text()),
    commentCount: parseCount($('.comment-tit .num, .cmt-tit .num').first().text()),
    text: root ? htmlToText(root) : '',
    media,
    url,
  };
}
