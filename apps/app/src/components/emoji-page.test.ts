import { describe, expect, it } from 'vitest';
import { emojiCategories } from '@smarteverything/domain';
import { COMMON_EMOJI, emojiMatches, emojiPage, emojiPickerCategories } from './emoji-page';
import { emojiPickerLayout } from './emoji-picker-layout';

const phone = { width: 354, height: 848, controlsHeight: 176, pointer: false } as const;

describe('emoji picker pages', () => {
  it('reaches every category choice once with a bounded number of mounted choices', () => {
    for (const { name, choices } of emojiCategories()) {
      const matches = emojiMatches(name, '');
      const size = emojiPickerLayout({ ...phone, count: matches.length }).pageSize;
      const pageCount = emojiPage(matches, 0, size).total;
      const pages = Array.from({ length: pageCount }, (_, index) =>
        emojiPage(matches, index * size, size),
      );
      expect(pages.flatMap(({ entries }) => entries)).toEqual(choices);
      expect(pages.every(({ entries }) => entries.length <= size)).toBe(true);
    }
  });

  it('offers a varied first page and exposes every catalogue category', () => {
    const common = emojiMatches(COMMON_EMOJI, '');
    const size = emojiPickerLayout({ ...phone, count: common.length }).pageSize;
    const first = emojiPage(common, 0, size);
    expect(first.total).toBe(1);
    expect(new Set(first.entries.map(({ glyph }) => glyph)).size).toBe(first.entries.length);
    expect(first.entries.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'thumbs up',
        'red heart',
        'face with tears of joy',
        'party popper',
        'thinking face',
        'crying face',
        'thumbs down',
      ]),
    );
    expect(emojiPickerCategories().map(({ name }) => name)).toEqual([
      COMMON_EMOJI,
      ...emojiCategories().map(({ name }) => name),
    ]);
  });

  it('fills the available phone, foldable and desktop width and bounds dense categories by height', () => {
    const count = 2261;
    expect(emojiPickerLayout({ ...phone, count })).toEqual({
      cellWidth: 50,
      categoryWidth: 59,
      pageSize: 42,
    });
    expect(
      emojiPickerLayout({ ...phone, width: 642, height: 800, controlsHeight: 128, count }),
    ).toEqual({
      cellWidth: 49,
      categoryWidth: 58,
      pageSize: 78,
    });
    expect(emojiPickerLayout({ ...phone, width: 432, height: 900, pointer: true, count })).toEqual({
      cellWidth: 43,
      categoryWidth: 61,
      pageSize: 70,
    });
  });

  it('keeps complete rows and pagination within a short sheet, including when search has focus', () => {
    const count = 169;
    expect(emojiPickerLayout({ ...phone, width: 302, height: 440, count }).pageSize).toBe(12);
    expect(
      emojiPickerLayout({ ...phone, width: 302, height: 284, controlsHeight: 74, count }).pageSize,
    ).toBe(6);
  });

  it('clamps resized pages and searches globally by name, short name or exact glyph', () => {
    expect(emojiPage([1, 2, 3, 4, 5], 9, 2)).toEqual({
      entries: [5],
      start: 4,
      end: 5,
      current: 2,
      total: 3,
    });
    expect(emojiMatches(COMMON_EMOJI, ':flag_thailand:').map(({ glyph }) => glyph)).toEqual(['🇹🇭']);
    expect(emojiMatches('Flags', '👩🏽‍💻').map(({ glyph }) => glyph)).toEqual(['👩🏽‍💻']);
    expect(emojiMatches('Flags', 'xyzzy')).toEqual([]);
    expect(emojiMatches('Flags', ' :_:- ')).toEqual([]);
  });
});
