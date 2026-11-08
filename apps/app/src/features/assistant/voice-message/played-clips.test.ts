import { describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(
  () => new Map<string, unknown>([['voiceClips', { played: [], speed: 1 }]]),
);

vi.mock('../../../store/local-prefs', () => ({
  localPref: (key: string): unknown => stored.get(key),
  setLocalPref: (key: string, value: unknown): void => {
    stored.set(key, value);
  },
  useLocalPref: (key: string): unknown => stored.get(key),
}));

const { CLIP_SPEEDS, cycleClipSpeed, markClipPlayed, nextClipSpeed } =
  await import('./played-clips');

describe('played clips and speed', () => {
  it('cycles 1, 1.5, 2 and back to 1', () => {
    expect(CLIP_SPEEDS).toStrictEqual([1, 1.5, 2]);
    expect(nextClipSpeed(1)).toBe(1.5);
    expect(nextClipSpeed(1.5)).toBe(2);
    expect(nextClipSpeed(2)).toBe(1);
  });

  it('remembers the chosen speed', () => {
    cycleClipSpeed();
    expect(stored.get('voiceClips')).toStrictEqual({ played: [], speed: 1.5 });
  });

  it('records each played attachment once', () => {
    markClipPlayed('a');
    markClipPlayed('b');
    markClipPlayed('a');
    expect(stored.get('voiceClips')).toStrictEqual({ played: ['a', 'b'], speed: 1.5 });
  });
});
