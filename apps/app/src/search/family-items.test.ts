import { describe, expect, it } from 'vitest';
import { familySearchItems } from './family-items';

describe('family search items', () => {
  it('finds the microwave cooking program, notifications and history by the words people use', () => {
    const items = familySearchItems('microwave');
    const words = (key: string): readonly string[] =>
      items.find((item) => item.key === key)?.keywords ?? [];
    expect(words('cooking-program')).toEqual(expect.arrayContaining(['air fry', 'defrost']));
    expect(words('notify-ready')).toContain('done');
    expect(words('notify-inside')).toContain('forgotten');
    expect(words('recent-cooking')).toContain('history');
  });

  it('gives every item of a family its own key and a title', () => {
    const items = familySearchItems('microwave');
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
    expect(items.every((item) => item.title !== '')).toBe(true);
  });

  it('offers nothing for a family without in-page controls', () => {
    expect(familySearchItems('light')).toEqual([]);
  });
});
