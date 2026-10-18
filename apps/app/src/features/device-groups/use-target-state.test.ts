import { describe, expect, it } from 'vitest';
import { deviceFixture, stateFixture, valuesFixture } from '../../store/device-fixture';
import { changedSlices, trackReads } from '../../store/subscriptions';
import { viewSelector } from './use-target-state';

describe('a room target view', () => {
  const devices = Array.from({ length: 20 }, (_, index) => deviceFixture(index * 5 + 1));
  const base = stateFixture(
    devices,
    Object.fromEntries(
      devices.map((device, index) => [device.id, valuesFixture(index * 5 + 1, 0)]),
    ),
  );
  const select = viewSelector({ kind: 'room', roomId: 'room-1', families: ['light'] });

  it('is woken only by its own members', () => {
    const { reads, value } = trackReads(base, select);
    expect(value.state.members).toBe(10);
    const other = {
      ...base,
      deviceValues: base.deviceValues
        .set('dev-6', valuesFixture(6, 1))
        .set('dev-16', valuesFixture(16, 1)),
    };
    const member = {
      ...base,
      deviceValues: base.deviceValues.set('dev-11', valuesFixture(11, 1)),
    };
    const touches = (next: typeof base): boolean =>
      [...changedSlices(base, next)].some((slice) => reads.has(slice));
    expect(touches(other)).toBe(false);
    expect(touches(member)).toBe(true);
  });
});
