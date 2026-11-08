import { describe, expect, it } from 'vitest';
import { categoryLabel, sentenceCase } from './text';

describe('sentenceCase', () => {
  it('capitalises only the first letter and leaves the rest as written', () => {
    expect(sentenceCase('amber, white, and 2 more')).toBe('Amber, white, and 2 more');
    expect(sentenceCase('Mixed colours')).toBe('Mixed colours');
  });

  it('leaves an empty text empty', () => {
    expect(sentenceCase('')).toBe('');
  });
});

describe('categoryLabel', () => {
  it('turns a dashed or underscored id into a capitalised phrase', () => {
    expect(categoryLabel('living_room')).toBe('Living room');
    expect(categoryLabel('kids-pets')).toBe('Kids pets');
  });

  it('keeps an id that has no words', () => {
    expect(categoryLabel('--')).toBe('--');
  });
});
