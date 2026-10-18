import { describe, expect, it } from 'vitest';
import type { Block, Inline } from './parse';
import { blockLength, inlineLength, renderedLength, startsFrom, startsOf } from './rendered-length';

const text = (value: string): Inline => ({ kind: 'text', text: value });
const strong = (value: string): Inline => ({ kind: 'strong', text: value });

describe('inlineLength', () => {
  it('counts what a reader sees, not code units', () => {
    expect(inlineLength([text('ab'), strong('cd')])).toBe(4);
    expect(inlineLength([text('👨‍👩‍👧'), text('é')])).toBe(2);
  });
});

describe('blockLength', () => {
  it('counts the words of paragraphs, headings and quotes', () => {
    const inline = [text('hello')];
    expect(blockLength({ kind: 'paragraph', inline })).toBe(5);
    expect(blockLength({ kind: 'heading', level: 2, inline })).toBe(5);
    expect(blockLength({ kind: 'quote', inline })).toBe(5);
  });

  it('adds up every item of a list', () => {
    const block: Block = { kind: 'list', ordered: true, items: [[text('one')], [text('to')]] };
    expect(blockLength(block)).toBe(5);
  });

  it('does not count code or tables, which appear whole', () => {
    expect(blockLength({ kind: 'code', language: 'ts', code: 'const a = 1;' })).toBe(0);
    expect(blockLength({ kind: 'table', header: [[text('a')]], rows: [[[text('b')]]] })).toBe(0);
  });
});

describe('renderedLength', () => {
  it('sums the blocks and answers again from memory for the same list', () => {
    const blocks: readonly Block[] = [
      { kind: 'paragraph', inline: [text('abc')] },
      { kind: 'code', language: '', code: 'x' },
      { kind: 'quote', inline: [text('de')] },
    ];
    expect(renderedLength(blocks)).toBe(5);
    expect(renderedLength(blocks)).toBe(5);
  });

  it('is zero for no blocks', () => {
    expect(renderedLength([])).toBe(0);
  });
});

describe('startsFrom', () => {
  it('gives where each part begins after the first offset', () => {
    expect(startsFrom([3, 0, 4], 10)).toEqual([10, 13, 13]);
    expect(startsFrom([], 5)).toEqual([]);
  });
});

describe('startsOf', () => {
  it('measures each text in graphemes', () => {
    expect(startsOf(['ab', '👍🏽', 'c'], 0)).toEqual([0, 2, 3]);
  });
});
