import { describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => new Map<string, unknown>([['vacuumFinishes', {}]]));

vi.mock('../../../store/local-prefs', () => ({
  localPref: (key: string): unknown => stored.get(key),
  setLocalPref: (key: string, value: unknown): void => {
    stored.set(key, value);
  },
  useLocalPref: (key: string): unknown => stored.get(key),
}));

const { chooseVacuumFinish, vacuumFinishOf } = await import('./vacuum-finish');

describe('the vacuum finish choice', () => {
  it('draws graphite for a robot nobody has chosen a colour for', () => {
    expect(vacuumFinishOf({}, 'robot-1')).toBe('graphite');
    expect(vacuumFinishOf({ 'robot-2': 'white' }, 'robot-1')).toBe('graphite');
  });

  it('keeps one choice per robot', () => {
    chooseVacuumFinish('robot-1', 'white');
    chooseVacuumFinish('robot-2', 'black');
    expect(stored.get('vacuumFinishes')).toStrictEqual({ 'robot-1': 'white', 'robot-2': 'black' });
  });
});
