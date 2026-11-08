import { describe, expect, it } from 'vitest';
import { isTaskRunning, selectionOf } from './overview';

const ROOMS = [
  { id: 3, name: 'Kitchen', colour: 0, floor: 0, areaM2: 12, hidden: false },
  { id: 4, name: 'Hall', colour: 1, floor: 0, areaM2: 8, hidden: false },
];

describe('overview modules', () => {
  it('load without a browser or a device', async () => {
    const overview = await import('./overview');
    const chips = await import('./overview-chips');
    const page = await import('../page');
    expect(typeof overview.VacuumOverview).toBe('function');
    expect(typeof chips.RoomChips).toBe('function');
    expect(typeof page.VacuumPage).toBe('function');
  });
});

describe('room picking', () => {
  it('lets rooms be picked while docked, charging and awake', () => {
    const values = { vacuum_status: 2, vacuum_asleep: false };
    expect(isTaskRunning(values)).toBe(false);
    expect(
      selectionOf({ taskRunning: false, picked: [4, 3], job: null, rooms: ROOMS }),
    ).toStrictEqual([4, 3]);
  });

  it('lets rooms be picked while idle and while full on the dock', () => {
    for (const status of [1, 9]) {
      expect(isTaskRunning({ vacuum_status: status, vacuum_asleep: false })).toBe(false);
    }
  });

  it('locks picking to the running job while a task runs', () => {
    expect(isTaskRunning({ vacuum_status: 4, vacuum_asleep: false })).toBe(true);
    expect(selectionOf({ taskRunning: true, picked: [3], job: null, rooms: ROOMS })).toStrictEqual(
      [],
    );
  });
});
