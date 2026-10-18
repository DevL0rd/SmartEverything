import { describe, expect, it } from 'vitest';
import { deviceFixture, stateFixture } from '../../../store/device-fixture';
import { DRAWING_WATTS, isDrawing, readConfirmation } from './confirmation';

const PLUG = '00000000-0000-4000-8000-0000000000d1';

function world(online: boolean, watts: number | null): ReturnType<typeof stateFixture> {
  const plug = deviceFixture(0, {
    id: PLUG,
    kind: 'plug',
    name: 'Desk plug',
    online,
    capabilities: [
      {
        key: 'power_draw',
        label: 'Power draw',
        access: 'read',
        value: { kind: 'number', min: 0, max: 3000, step: 1, unit: 'W' },
      },
    ],
  });
  return stateFixture(
    [plug],
    watts === null
      ? {}
      : { [PLUG]: { power_draw: { value: watts, observedAt: '2026-10-18T10:00:00.000Z' } } },
  );
}

describe('readConfirmation', () => {
  it('is confirmed on when the linked plug draws power', () => {
    expect(readConfirmation(world(true, 38), PLUG)).toEqual({
      on: true,
      by: 'Desk plug',
      watts: 38,
    });
  });

  it('is confirmed off when the plug draws almost nothing', () => {
    expect(readConfirmation(world(true, 1), PLUG)?.on).toBe(false);
  });

  it('confirms nothing without a link, a reading or an online plug', () => {
    expect(readConfirmation(world(true, 38), null)).toBeNull();
    expect(readConfirmation(world(true, null), PLUG)).toBeNull();
    expect(readConfirmation(world(false, 38), PLUG)).toBeNull();
    expect(readConfirmation(world(true, 38), 'gone')).toBeNull();
  });

  it('draws at the threshold and above', () => {
    expect(isDrawing(DRAWING_WATTS)).toBe(true);
    expect(isDrawing(DRAWING_WATTS - 0.1)).toBe(false);
  });
});
