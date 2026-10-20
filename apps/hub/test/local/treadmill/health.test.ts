import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { InclineScale } from '@smarteverything/domain';
import { captureLogs } from '../../support/logs';
import { g15Rig, setScale, stopBelt, walk } from '../../support/g15-walk';
import type { TreadmillRig } from '../../support/treadmill-rig';

let rig: TreadmillRig;

beforeEach(async () => {
  captureLogs();
  rig = await g15Rig();
});

afterEach(async () => {
  await rig.close();
});

function elevationRecords(): { type: string; data: object }[] {
  return rig.test.store.health.records(
    {
      types: ['ElevationGained', 'ExerciseSession'],
      from: '2026-10-18T00:00:00.000Z',
      to: '2026-10-19T00:00:00.000Z',
    },
    rig.owner.profile.id,
  );
}

function walkWith(scale: InclineScale): void {
  setScale(rig, scale);
  walk(rig, 60, { kmh: 3.6, incline: 10 });
  stopBelt(rig, 61, 60);
}

describe('the climb in the walker’s health', () => {
  it('writes no elevation while the incline scale is not confirmed', () => {
    walkWith('unconfirmed');
    expect(elevationRecords().map((record) => record.type)).toEqual(['ExerciseSession']);
  });

  it('writes the climb as ElevationGained once the scale is confirmed', () => {
    walkWith('percent');
    const records = elevationRecords();
    expect(records.map((record) => record.type).sort()).toEqual([
      'ElevationGained',
      'ExerciseSession',
    ]);
    const elevation = records.find((record) => record.type === 'ElevationGained');
    const meters =
      elevation !== undefined && 'meters' in elevation.data ? elevation.data.meters : 0;
    expect(meters).toBeCloseTo(5.9, 1);
  });
});
