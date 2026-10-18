import { describe, expect, it } from 'vitest';
import { soundSelection } from './sound-filter';

describe('sound detection selection', () => {
  it('starts a selection from nothing chosen', () => {
    expect(soundSelection([], 'baby_cry', true)).toStrictEqual(['baby_cry']);
  });

  it('adds to and removes from a selection', () => {
    expect(soundSelection(['baby_cry'], 'loud_sound', true)).toStrictEqual([
      'baby_cry',
      'loud_sound',
    ]);
    expect(soundSelection(['baby_cry', 'loud_sound'], 'baby_cry', false)).toStrictEqual([
      'loud_sound',
    ]);
  });

  it('goes back to any sound when the last detection is removed, never to none', () => {
    expect(soundSelection(['baby_cry'], 'baby_cry', false)).toBeNull();
  });
});
