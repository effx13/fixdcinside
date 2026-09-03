import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { parseList } from '../src/parser/list';
import { parsePost } from '../src/parser/post';
import type { ListTarget, PostTarget } from '../src/types';

/**
 * Not a test - a stopwatch. `BENCH=1 pnpm exec vitest run test/bench.test.ts`
 * writes a breakdown to _bench.txt. Skipped by default.
 */
const lines: string[] = [];
function report(line: string): void {
  lines.push(line);
  writeFileSync('_bench.txt', lines.join('\n') + '\n');
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function grab(url: string): Promise<{ html: string; ms: number }> {
  const start = performance.now();
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://gall.dcinside.com/' },
  });
  const html = await response.text();
  return { html, ms: performance.now() - start };
}

function time(label: string, runs: number, fn: () => void): void {
  fn();
  const start = performance.now();
  for (let i = 0; i < runs; i++) fn();
  report(`${label}: ${((performance.now() - start) / runs).toFixed(1)}ms`);
}

describe.skipIf(process.env.BENCH !== '1')('where the time goes', () => {
  it('post page', { timeout: 120_000 }, async () => {
    const target: PostTarget = { kind: 'post', board: 'gall', id: 'cat', no: '1958907', extra: {} };
    const { html, ms } = await grab('https://gall.dcinside.com/board/view/?id=cat&no=1958907');
    report(`desktop post fetch (from Korea): ${ms.toFixed(0)}ms for ${(html.length / 1024).toFixed(0)}KB`);
    time('  cheerio parse (post)', 5, () => parsePost(html, target, 'x', 'desktop'));
  });

  it('list page', { timeout: 120_000 }, async () => {
    const target: ListTarget = { kind: 'list', board: 'mgallery', id: 'sff', extra: {} };
    const { html, ms } = await grab('https://gall.dcinside.com/mgallery/board/lists/?id=sff');
    report(`desktop list fetch (from Korea): ${ms.toFixed(0)}ms for ${(html.length / 1024).toFixed(0)}KB`);
    time('  cheerio parse (list)', 5, () => parseList(html, target, 'x'));
  });

  it('mobile page', { timeout: 120_000 }, async () => {
    const { html, ms } = await grab('https://m.dcinside.com/board/cat/1958907');
    report(`mobile post fetch (from Korea): ${ms.toFixed(0)}ms for ${(html.length / 1024).toFixed(0)}KB`);
  });
});
