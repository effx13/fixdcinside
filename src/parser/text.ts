import { isTag, isText, type AnyNode } from 'domhandler';

/** Tags whose boundaries should become line breaks in the flattened text. */
const BLOCK_TAGS = new Set(['div', 'p', 'br', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote']);

/** Tags whose contents are never post text. */
const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'iframe']);

/**
 * Flatten a dcinside post body to plain text.
 *
 * dcinside writes posts as a soup of <div>s and <br>s with no semantic markup,
 * so we walk the tree ourselves: block elements and <br> become newlines, and
 * scripts are dropped.
 */
export function htmlToText(root: AnyNode): string {
  const out: string[] = [];

  const walk = (node: AnyNode): void => {
    if (isText(node)) {
      out.push(node.data);
      return;
    }
    if (!isTag(node)) return;

    const name = node.name.toLowerCase();
    if (SKIP_TAGS.has(name)) return;
    if (name === 'br') {
      out.push('\n');
      return;
    }

    const isBlock = BLOCK_TAGS.has(name);
    if (isBlock) out.push('\n');
    for (const child of node.children) walk(child);
    if (isBlock) out.push('\n');
  };

  walk(root);
  return normalizeWhitespace(out.join(''));
}

/**
 * Zero-width padding dcinside sprinkles through post bodies. Deliberately
 * excludes U+200D ZERO WIDTH JOINER, which holds emoji sequences together.
 */
const ZERO_WIDTH = /[\u200B\u200C\uFEFF]/g;
/** Non-breaking and ideographic spaces, which should collapse like a space. */
const WIDE_SPACE = /[ \t\u00A0\u3000]+/g;

export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(ZERO_WIDTH, '')
    .replace(WIDE_SPACE, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Truncate on a word boundary, appending an ellipsis when we cut. */
export function truncate(input: string, limit: number): string {
  if (input.length <= limit) return input;
  const cut = input.slice(0, limit - 1);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > limit * 0.6 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

/** `조회 175` / `추천 9` / `댓글 7` -> the number. */
export function parseCount(input: string | undefined | null): number {
  if (!input) return 0;
  const match = input.replace(/,/g, '').match(/-?\d+/);
  return match ? Number(match[0]) : 0;
}
