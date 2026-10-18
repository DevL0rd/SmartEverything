import { describe, expect, it } from 'vitest';
import { triggerKeywordsOf } from './trigger-keywords';

describe('search words of triggers', () => {
  it('finds the words of an event and its detail', () => {
    const words = triggerKeywordsOf([
      { on: 'signal', source: 'event', kind: 'sound', match: { detection: 'baby_cry' } },
    ]);
    expect(words).toContain('event');
    expect(words).toContain('noise');
  });

  it('has nothing to add for clock and sun triggers', () => {
    expect(
      triggerKeywordsOf([
        { on: 'time', at: '07:00' },
        { on: 'sun', event: 'sunset' },
      ]),
    ).toEqual([]);
  });

  it('lists each word once', () => {
    const words = triggerKeywordsOf([
      { on: 'signal', source: 'event', kind: 'motion' },
      { on: 'signal', source: 'event', kind: 'motion' },
    ]);
    expect(new Set(words).size).toBe(words.length);
  });
});
