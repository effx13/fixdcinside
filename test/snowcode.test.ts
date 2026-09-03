import { describe, expect, it } from 'vitest';
import { decodeSnowcode, encodeSnowcode } from '../src/util/snowcode';

describe('snowcode', () => {
  it('round-trips a post reference', () => {
    const value = { b: 'mgallery', g: 'sff', n: '1720050' };
    const encoded = encodeSnowcode(value);
    expect(encoded).toMatch(/^\d+$/);
    expect(decodeSnowcode(encoded)).toEqual(value);
  });

  it('decodes what FxEmbed produces, which is the format Discord passes back', () => {
    // Taken from a live fixupx.com page: {"i":"1848831595014459513"}
    expect(decodeSnowcode('66086667665360566060555357615752535656576157535566')).toEqual({
      i: '1848831595014459513',
    });
  });

  it('tolerates the separators Discord may leave in the id', () => {
    const encoded = encodeSnowcode({ g: 'cat', n: '1' });
    expect(decodeSnowcode(`${encoded}`)).toEqual({ g: 'cat', n: '1' });
  });

  it('rejects nonsense instead of throwing', () => {
    expect(decodeSnowcode('')).toBeNull();
    expect(decodeSnowcode('123')).toBeNull();
    expect(decodeSnowcode('9999')).toBeNull();
    expect(decodeSnowcode('abc')).toBeNull();
  });
});
