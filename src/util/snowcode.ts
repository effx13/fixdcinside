/**
 * Smuggle a small object through a Mastodon status id.
 *
 * Discord takes the id out of a page's activity+json link and asks the host for
 * `/api/v1/statuses/{id}`, so that id is the only thing we get to carry - and a
 * Mastodon status id is numeric. Encoding each character of a JSON string as a
 * two-digit index gives a numeric id that still holds which gallery and post to
 * fetch. FxEmbed calls the same trick a snowcode.
 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789{}[]":,.-_';

export function encodeSnowcode(value: Record<string, string>): string {
  // The braces are implied, which keeps the id a little shorter.
  const json = JSON.stringify(value).slice(1, -1);
  let encoded = '';
  for (const char of json) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`snowcode cannot encode ${JSON.stringify(char)}`);
    encoded += index.toString().padStart(2, '0');
  }
  return encoded;
}

export function decodeSnowcode(encoded: string): Record<string, string> | null {
  const digits = encoded.match(/\d+/g)?.join('') ?? '';
  if (digits.length === 0 || digits.length % 2 !== 0) return null;

  let json = '';
  for (let i = 0; i < digits.length; i += 2) {
    const char = ALPHABET[Number.parseInt(digits.slice(i, i + 2), 10)];
    if (char === undefined) return null;
    json += char;
  }

  try {
    const parsed: unknown = JSON.parse(`{${json}}`);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}
