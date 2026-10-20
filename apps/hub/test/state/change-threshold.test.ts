import type { DeviceCapability, StateChange } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { ChangeThreshold } from '../../src/state/change-threshold';
import { FakeClock } from '../support/fake-clock';

const START = '2026-10-18T10:00:00.000Z';
const LAMP = '11111111-1111-4111-8111-111111111111';

const BRIGHTNESS: DeviceCapability = {
  key: 'brightness',
  label: 'Brightness',
  access: 'read_write',
  value: { kind: 'number', min: 1, max: 100, step: 5 },
};

const LATENCY: DeviceCapability = {
  key: 'latency',
  label: 'Latency',
  access: 'read',
  value: { kind: 'number', min: 0, max: 1000, step: 1 },
};

const POWER: DeviceCapability = {
  key: 'power',
  label: 'Power',
  access: 'read_write',
  value: { kind: 'boolean' },
};

function bench(): {
  clock: FakeClock;
  moved: StateChange[];
  threshold: ChangeThreshold;
  offer: (
    capability: DeviceCapability,
    value: StateChange['value'],
    previous: StateChange['previous'],
  ) => void;
} {
  const clock = new FakeClock(START);
  const moved: StateChange[] = [];
  const threshold = new ChangeThreshold(clock, (change) => {
    moved.push(change);
  });
  return {
    clock,
    moved,
    threshold,
    offer: (capability, value, previous): void => {
      threshold.offer({ deviceId: LAMP, capability: capability.key, value, previous }, capability);
    },
  };
}

const at = (seconds: number): string => new Date(Date.parse(START) + seconds * 1000).toISOString();

describe('ChangeThreshold', () => {
  it('stays silent for the first value a device ever reports', () => {
    const { moved, offer } = bench();
    offer(BRIGHTNESS, 50, undefined);
    offer(POWER, true, undefined);
    expect(moved).toStrictEqual([]);
  });

  it('lets a number through only after it moved by the capability step from the last announced value', () => {
    const { clock, moved, offer } = bench();
    offer(BRIGHTNESS, 50, 40);
    clock.advanceTo(at(10));
    offer(BRIGHTNESS, 52, 50);
    offer(BRIGHTNESS, 54, 52);
    expect(moved.map((change) => change.value)).toStrictEqual([50]);
    offer(BRIGHTNESS, 55, 54);
    expect(moved.map((change) => [change.previous, change.value])).toStrictEqual([
      [40, 50],
      [50, 55],
    ]);
  });

  it('announces at most once every 2 seconds and then announces the latest value, never losing the last one', () => {
    const { clock, moved, offer } = bench();
    offer(BRIGHTNESS, 50, 40);
    clock.advanceTo(at(0.5));
    offer(BRIGHTNESS, 60, 50);
    clock.advanceTo(at(1));
    offer(BRIGHTNESS, 70, 60);
    expect(moved.map((change) => change.value)).toStrictEqual([50]);
    clock.advanceTo(at(2));
    expect(moved.map((change) => [change.previous, change.value])).toStrictEqual([
      [40, 50],
      [50, 70],
    ]);
    expect(clock.pending()).toStrictEqual([]);
  });

  it('forgets a waiting announcement when the value comes back within the step', () => {
    const { clock, moved, offer } = bench();
    offer(BRIGHTNESS, 50, 40);
    clock.advanceTo(at(0.5));
    offer(BRIGHTNESS, 70, 50);
    offer(BRIGHTNESS, 51, 70);
    clock.advanceTo(at(5));
    expect(moved.map((change) => change.value)).toStrictEqual([50]);
  });

  it('samples readings that are graphed on a 10 second grid instead of 2 seconds', () => {
    const { clock, moved, offer } = bench();
    offer(LATENCY, 20, 10);
    clock.advanceTo(at(5));
    offer(LATENCY, 40, 20);
    clock.advanceTo(at(9.9));
    expect(moved.map((change) => change.value)).toStrictEqual([20]);
    clock.advanceTo(at(10));
    expect(moved.map((change) => change.value)).toStrictEqual([20, 40]);
  });

  it('does not hold back booleans, and announces a value becoming unknown and coming back', () => {
    const { moved, offer } = bench();
    offer(POWER, true, false);
    offer(POWER, false, true);
    offer(BRIGHTNESS, null, 50);
    offer(BRIGHTNESS, 52, null);
    expect(moved.map((change) => [change.capability, change.previous, change.value])).toStrictEqual(
      [
        ['power', false, true],
        ['power', true, false],
        ['brightness', 50, null],
        ['brightness', null, 52],
      ],
    );
  });

  it('keeps each device capability on its own grid', () => {
    const { clock, moved, offer } = bench();
    offer(BRIGHTNESS, 50, 40);
    clock.advanceTo(at(0.1));
    offer(LATENCY, 30, 10);
    expect(moved.map((change) => change.capability)).toStrictEqual(['brightness', 'latency']);
  });

  it('does not hold numbers back for the length of a clock that was set backwards', () => {
    const { clock, moved, offer } = bench();
    clock.advanceTo(at(3600));
    offer(BRIGHTNESS, 50, 40);
    clock.advanceTo(at(0));
    offer(BRIGHTNESS, 70, 50);
    expect(moved.map((change) => change.value)).toStrictEqual([50, 70]);
  });

  it('drops a waiting announcement when it is closed', () => {
    const { clock, moved, offer, threshold } = bench();
    offer(BRIGHTNESS, 50, 40);
    clock.advanceTo(at(0.5));
    offer(BRIGHTNESS, 70, 50);
    threshold.close();
    clock.advanceTo(at(5));
    expect(moved.map((change) => change.value)).toStrictEqual([50]);
  });
});
