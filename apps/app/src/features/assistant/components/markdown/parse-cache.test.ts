import { describe, expect, it } from 'vitest';
import { parseMarkdown, readableBlocks, readableText } from './parse';
import { finalView } from '../../model/stream-view';

describe('parseMarkdown cache', () => {
  it('returns the same blocks for the same text', () => {
    const text = '# Title\n\nSome **bold** text';
    expect(parseMarkdown(text)).toBe(parseMarkdown(text));
  });

  it('keeps results correct after many distinct texts', () => {
    for (let index = 0; index < 700; index += 1) {
      expect(parseMarkdown(`item ${String(index)}`)).toEqual([
        { kind: 'paragraph', inline: [{ kind: 'text', text: `item ${String(index)}` }] },
      ]);
    }
    expect(parseMarkdown('item 0')).toEqual([
      { kind: 'paragraph', inline: [{ kind: 'text', text: 'item 0' }] },
    ]);
  });
});

describe('readableBlocks', () => {
  it('matches the readable text of the whole message', () => {
    const text = 'Intro with **bold**\n\n- one\n- two\n\n```ts\nconst a = 1;\n```\n\nClosing line';
    const view = finalView(text);
    expect(readableBlocks(view)).toBe(readableText(text));
  });
});
