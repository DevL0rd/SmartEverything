import { describe, expect, it } from 'vitest';
import { ASSISTANT_REACTION_CHANGE, EMOJI_SEQUENCE, emojiCategories, emojiOf } from '../src';

describe('assistant reaction catalogue', () => {
  it('accepts complete canonical emoji including joined variants, flags and keycaps', () => {
    for (const emoji of ['❤️', '👩🏽‍💻', '🇹🇭', '1️⃣', '👩‍👩‍👧‍👧', '🧑🏻‍🤝‍🧑🏿']) {
      expect(EMOJI_SEQUENCE.parse(emoji)).toBe(emoji);
      expect(emojiOf(emoji)?.name).toBeTruthy();
    }
    for (const emoji of ['❤', '😄😄', '1', '🇹', '👍🏼‍', ' hello ', '']) {
      expect(EMOJI_SEQUENCE.safeParse(emoji).success).toBe(false);
    }
  });

  it('keeps the exact Unicode catalogue without duplicate entries', () => {
    const categories = emojiCategories();
    const glyphs = categories.flatMap(({ choices }) => choices.map(({ glyph }) => glyph));
    expect(categories).toHaveLength(10);
    expect(glyphs).toHaveLength(3790);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it('accepts desired membership and refuses an actor supplied by the client', () => {
    const change = { emoji: '👍', present: false };
    expect(ASSISTANT_REACTION_CHANGE.parse(change)).toEqual(change);
    expect(ASSISTANT_REACTION_CHANGE.safeParse({ ...change, actor: 'Someone else' }).success).toBe(
      false,
    );
  });
});
