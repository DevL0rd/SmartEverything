import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

const { arrivalsText, seenThrough, watchArrivalsOf } = await import('./watch-notice');

const ME = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';
const ALEX = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';

function alarm(
  id: string,
  created_at: string,
  source: 'watch' | 'planner' = 'watch',
  profile_id = ME,
): {
  readonly id: string;
  readonly profile_id: string;
  readonly source: 'watch' | 'planner';
  readonly created_at: string;
  readonly time: string;
} {
  return { id, profile_id, source, created_at, time: '07:00' };
}

describe('watchArrivalsOf', () => {
  it('shows every alarm the watch brought in before the notice was dismissed', () => {
    const alarms = [
      alarm('a', '2026-11-10T07:00:00Z'),
      alarm('b', '2026-11-10T07:00:00Z', 'planner'),
      alarm('c', '2026-11-11T07:00:00Z'),
    ];
    expect(watchArrivalsOf(alarms, {}).map((each) => each.id)).toEqual(['a', 'c']);
  });

  it('shows only alarms that came in after the last dismissal of that person', () => {
    const alarms = [
      alarm('a', '2026-11-10T07:00:00Z'),
      alarm('c', '2026-11-12T07:00:00Z'),
      alarm('d', '2026-11-09T07:00:00Z', 'watch', ALEX),
    ];
    const seen = { [ME]: '2026-11-11T00:00:00Z' };
    expect(watchArrivalsOf(alarms, seen).map((each) => each.id)).toEqual(['c', 'd']);
  });
});

describe('seenThrough', () => {
  it('remembers the newest dismissed arrival per person and keeps the others', () => {
    const seen = { [ALEX]: '2026-11-01T00:00:00Z' };
    const next = seenThrough(seen, [
      alarm('a', '2026-11-12T07:00:00Z'),
      alarm('c', '2026-11-10T07:00:00Z'),
    ]);
    expect(next).toEqual({ [ALEX]: '2026-11-01T00:00:00Z', [ME]: '2026-11-12T07:00:00Z' });
    expect(watchArrivalsOf([alarm('a', '2026-11-12T07:00:00Z')], next)).toEqual([]);
  });
});

describe('arrivalsText', () => {
  it('counts the alarms that came in', () => {
    expect(arrivalsText(1)).toBe('1 alarm came in from your watch');
    expect(arrivalsText(3)).toBe('3 alarms came in from your watch');
  });
});
