import { describe, expect, it } from 'vitest';
import { deviceFixture } from '../../../store/device-fixture';
import type { DeviceSection } from './device-filter';
import { fillSizeOf, selectedFillDevice } from './grid-fill';

function section(key: string, count: number, lights = false): DeviceSection {
  const devices = Array.from({ length: count }, (_, index) => deviceFixture(index));
  return {
    key,
    title: key,
    count,
    lights: lights ? { devices, target: { kind: 'devices', deviceIds: [] } } : null,
    devices,
  };
}

describe('the expanded widget of the device list', () => {
  const deviceId = deviceFixture(0).id;

  it('expands the one device explicitly selected', () => {
    const only = section('kitchen', 1);
    expect(selectedFillDevice([only], deviceId)).toBe(only.devices[0]);
  });

  it('keeps the normal row when a search or room filter returns one device', () => {
    expect(selectedFillDevice([section('kitchen', 1)], null)).toBeNull();
  });

  it('keeps the normal row while the deferred results contain another device', () => {
    expect(selectedFillDevice([section('kitchen', 1)], deviceFixture(1).id)).toBeNull();
  });

  it('expands no device when two widgets remain', () => {
    expect(selectedFillDevice([section('kitchen', 2)], deviceId)).toBeNull();
    expect(selectedFillDevice([section('kitchen', 1), section('hall', 1)], deviceId)).toBeNull();
    expect(selectedFillDevice([section('kitchen', 1, true)], deviceId)).toBeNull();
  });

  it('expands no device for an empty list', () => {
    expect(selectedFillDevice([], deviceId)).toBeNull();
    expect(selectedFillDevice([section('kitchen', 0)], deviceId)).toBeNull();
  });
});

describe('the fill size', () => {
  const sizes = { compact: ['M'], medium: ['M', 'W'], expanded: ['W', 'M', 'XL'] } as const;

  it('picks the largest size the widget offers on this board', () => {
    expect(fillSizeOf({ sizes, defaultSize: 'M' }, 'compact')).toBe('M');
    expect(fillSizeOf({ sizes, defaultSize: 'M' }, 'medium')).toBe('W');
    expect(fillSizeOf({ sizes, defaultSize: 'M' }, 'expanded')).toBe('XL');
  });

  it('keeps the default size when the board offers none', () => {
    const none = { compact: [], medium: [], expanded: [] } as const;
    expect(fillSizeOf({ sizes: none, defaultSize: 'W' }, 'compact')).toBe('W');
  });
});
