import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { splitMessage } from '../../../src/plugins/builtin/discord/split';

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

describe('splitMessage', () => {
  it('returns a message that fits as one piece, and nothing for no text', () => {
    expect(splitMessage('hello', 10)).toEqual(['hello']);
    expect(splitMessage('a'.repeat(2000))).toEqual(['a'.repeat(2000)]);
    expect(splitMessage('')).toEqual([]);
  });

  it('splits at the default Discord limit of 2000 characters', () => {
    const pieces = splitMessage('word '.repeat(500));
    expect(pieces.length).toBeGreaterThan(1);
    expect(Math.max(...pieces.map((piece) => piece.length))).toBeLessThanOrEqual(2000);
  });

  it('prefers a paragraph break, then a line break, then a space', () => {
    expect(splitMessage('aaaa bbbb\n\ncccc dddd', 12)).toEqual(['aaaa bbbb', 'cccc dddd']);
    expect(splitMessage('aaaa bbbb\ncccc dddd', 12)).toEqual(['aaaa bbbb', 'cccc dddd']);
    expect(splitMessage('aaaa bbbb cccc', 10)).toEqual(['aaaa bbbb', 'cccc']);
  });

  it('cuts a word that has no break at all, at the limit', () => {
    expect(splitMessage('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('ignores a break so early that it would leave a sliver', () => {
    expect(splitMessage('a bcdefghijklmnop', 10)).toEqual(['a bcdefghi', 'jklmnop']);
  });

  it('never cuts a surrogate pair in half', () => {
    const pieces = splitMessage('😀'.repeat(6), 5);
    expect(pieces.every((piece) => !LONE_SURROGATE.test(piece))).toBe(true);
    expect(pieces.join('')).toBe('😀'.repeat(6));
  });

  it('closes a code block at the end of a piece and reopens it, with its language, in the next', () => {
    const code = ['```ts', 'one();', 'two();', 'three();', '```'].join('\n');
    const pieces = splitMessage(code, 24);
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      expect(piece.length).toBeLessThanOrEqual(24);
      expect((piece.match(/^\s*```/gm) ?? []).length % 2).toBe(0);
    }
    expect(pieces[1]?.startsWith('```ts\n')).toBe(true);
  });

  it('leaves a code block that closes inside a piece alone', () => {
    expect(splitMessage('```\nx\n```\nafter text that goes on', 20)[0]).toBe('```\nx\n```');
  });

  it('refuses a limit too small to hold a code fence', () => {
    expect(() => splitMessage('```\n' + 'x'.repeat(30), 4)).toThrow(RangeError);
  });

  it('keeps every piece within the limit and loses no text', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'binary', maxLength: 600 }),
        fc.integer({ min: 20, max: 80 }),
        (text, limit) => {
          const pieces = splitMessage(text, limit);
          expect(pieces.every((piece) => piece.length <= limit)).toBe(true);
          expect(
            pieces.every((piece) => !LONE_SURROGATE.test(piece) || LONE_SURROGATE.test(text)),
          ).toBe(true);
          const kept = pieces.join('').replace(/\s/g, '');
          expect(kept.length).toBe(text.replace(/\s/g, '').length);
        },
      ),
      { numRuns: 60 },
    );
  });
});
