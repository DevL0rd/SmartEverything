import { describe, expect, it } from 'vitest';
import { CAMERA_EVENT_SEARCH_WORDS, signalTriggerKeywords } from '../src/search-triggers';

const BABY_CRY = {
  source: 'event',
  kind: 'sound',
  match: { detection: 'baby_cry' },
} as const;

describe('CAMERA_EVENT_SEARCH_WORDS', () => {
  it('holds the sound words and the labels and keywords of every camera detection', () => {
    expect(CAMERA_EVENT_SEARCH_WORDS).toEqual(
      expect.arrayContaining(['sound', 'noise', 'Baby crying', 'infant', 'Person seen', 'human']),
    );
  });
});

describe('signalTriggerKeywords', () => {
  it('names an event signal by its source, kind and the detection it matches', () => {
    const words = signalTriggerKeywords(BABY_CRY);
    expect(words.slice(0, 2)).toStrictEqual(['event', 'Sound']);
    expect(words).toEqual(
      expect.arrayContaining(['noise', 'Baby crying', 'infant', 'What the camera detected']),
    );
  });

  it('ignores a match value the signal kind does not list', () => {
    const words = signalTriggerKeywords({
      source: 'event',
      kind: 'sound',
      match: { detection: 'nonsense' },
    });
    expect(words).not.toContain('What the camera detected');
    expect(words).not.toContain('nonsense');
  });

  it('falls back to the kind for a signal source it does not know', () => {
    expect(signalTriggerKeywords({ source: 'plugin_x', kind: 'pressed', match: {} })).toStrictEqual(
      ['plugin_x', 'pressed'],
    );
  });
});
