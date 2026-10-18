import { describe, expect, it } from 'vitest';
import type { DeviceRow } from '@smarteverything/domain';
import { deviceFixture } from '../../../store/device-fixture';
import { splitRoomLights } from './room-lights';

const light = (
  index: number,
  overrides: Partial<DeviceRow> = {},
): ReturnType<typeof deviceFixture> => deviceFixture(index, { kind: 'light', ...overrides });

describe('splitting a room into its lights and the rest', () => {
  it('carries two or more visible lights and leaves the other devices as tiles', () => {
    const first = light(1);
    const second = light(2);
    const plug = deviceFixture(0, { kind: 'plug' });
    const split = splitRoomLights([first, plug, second]);
    expect(split?.lights).toStrictEqual([first, second]);
    expect(split?.rest).toStrictEqual([plug]);
  });

  it('does not carry a single light or hidden lights', () => {
    expect(splitRoomLights([light(1)])).toBeNull();
    expect(splitRoomLights([light(1), light(2, { hidden: true })])).toBeNull();
  });
});
