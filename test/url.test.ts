import { describe, expect, it } from 'vitest';
import { buildDcUrl, canonicalDcUrl, parseTarget } from '../src/parser/url';

const at = (path: string) => new URL(`https://fixdcinside.com${path}`);

describe('parseTarget', () => {
  it('parses a minor gallery post with its query params', () => {
    const target = parseTarget(at('/mgallery/board/view/?id=sff&no=1719767&exception_mode=recommend&page=1'));
    expect(target).toEqual({
      kind: 'post',
      board: 'mgallery',
      id: 'sff',
      no: '1719767',
      extra: { page: '1', exception_mode: 'recommend' },
    });
  });

  it('parses a minor gallery listing', () => {
    expect(parseTarget(at('/mgallery/board/lists/?id=sff&exception_mode=recommend'))).toEqual({
      kind: 'list',
      board: 'mgallery',
      id: 'sff',
      extra: { exception_mode: 'recommend' },
    });
  });

  it('parses a main gallery post', () => {
    const target = parseTarget(at('/board/view/?id=cat&no=2525815'));
    expect(target).toMatchObject({ kind: 'post', board: 'gall', id: 'cat', no: '2525815' });
  });

  it('parses mini and person galleries', () => {
    expect(parseTarget(at('/mini/board/view/?id=x&no=5'))).toMatchObject({ board: 'mini' });
    expect(parseTarget(at('/person/board/lists/?id=y'))).toMatchObject({ board: 'person', kind: 'list' });
  });

  it('parses mobile-style and shorthand paths', () => {
    expect(parseTarget(at('/board/sff/1719767'))).toMatchObject({ kind: 'post', id: 'sff', no: '1719767' });
    expect(parseTarget(at('/board/sff'))).toMatchObject({ kind: 'list', id: 'sff' });
    expect(parseTarget(at('/sff/1719767'))).toMatchObject({ kind: 'post', id: 'sff', no: '1719767' });
    expect(parseTarget(at('/sff'))).toMatchObject({ kind: 'list', id: 'sff' });
  });

  it('rejects junk', () => {
    expect(parseTarget(at('/'))).toBeNull();
    expect(parseTarget(at('/board/view/?no=1'))).toBeNull();
    expect(parseTarget(at('/board/view/?id=cat&no=abc'))).toBeNull();
    expect(parseTarget(at('/sff/1/2/3'))).toBeNull();
  });

  it("refuses to read the worker's own routes as gallery names", () => {
    expect(parseTarget(at('/media/'))).toBeNull();
    expect(parseTarget(at('/media/abc'))).toBeNull();
    expect(parseTarget(at('/api'))).toBeNull();
    expect(parseTarget(at('/oembed'))).toBeNull();
    expect(parseTarget(at('/mosaic/gall/cat/1'))).toBeNull();
    expect(parseTarget(at('/robots.txt'))).toBeNull();
    expect(parseTarget(at('/icon.svg'))).toBeNull();
  });

  it('drops params dcinside does not need', () => {
    const target = parseTarget(at('/board/view/?id=cat&no=1&utm_source=evil&page=3'));
    expect(target?.extra).toEqual({ page: '3' });
  });
});

describe('buildDcUrl', () => {
  it('round-trips a minor gallery post', () => {
    const target = parseTarget(at('/mgallery/board/view/?id=sff&no=1719767&page=1'))!;
    expect(buildDcUrl(target)).toBe(
      'https://gall.dcinside.com/mgallery/board/view/?id=sff&no=1719767&page=1',
    );
  });

  it('strips paging noise for the canonical url', () => {
    const target = parseTarget(
      at('/mgallery/board/view/?id=sff&no=1719767&page=4&exception_mode=recommend'),
    )!;
    expect(canonicalDcUrl(target)).toBe('https://gall.dcinside.com/mgallery/board/view/?id=sff&no=1719767');
  });

  it('uses no prefix for main galleries', () => {
    const target = parseTarget(at('/board/lists/?id=cat'))!;
    expect(buildDcUrl(target)).toBe('https://gall.dcinside.com/board/lists/?id=cat');
  });
});
