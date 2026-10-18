import type { DeviceCapability, PresentedCapability } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { Device } from '../../../store/state';
import { deviceModelOf } from '../model/device-model';
import { isSliderControl, labelModeOf } from './number-kind';

const CAPABILITIES: readonly DeviceCapability[] = [
  { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
  {
    key: 'brightness',
    label: 'Brightness',
    access: 'read_write',
    value: { kind: 'number', min: 0, max: 254, step: 1 },
  },
  {
    key: 'target_temperature',
    label: 'Target temperature',
    access: 'read_write',
    value: { kind: 'number', min: 16, max: 30, step: 1 },
  },
];

function device(): Device {
  return {
    id: 'lamp',
    provider: 'local',
    external_id: 'lamp',
    parent_id: null,
    kind: 'light',
    name: 'Lamp',
    display_name: null,
    model: 'generic',
    manufacturer: 'test',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: [...CAPABILITIES],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
    label: 'Lamp',
  };
}

function presented(key: string): PresentedCapability {
  const found = deviceModelOf(device()).presentation.capabilities.find(
    (candidate) => candidate.key === key,
  );
  if (found === undefined) {
    throw new Error(`Expected a capability named ${key}`);
  }
  return found;
}

describe('slider labels', () => {
  it('treats a wide numeric range as a slider and a dial range as a stepper', () => {
    expect(isSliderControl(presented('brightness'))).toBe(true);
    expect(isSliderControl(presented('target_temperature'))).toBe(false);
  });

  it('keeps the label inline while the track keeps its minimum length', () => {
    expect(labelModeOf(presented('brightness'), 'inline', 326)).toBe('inline');
  });

  it('moves the label above the slider when the track would get too short', () => {
    expect(labelModeOf(presented('brightness'), 'inline', 200)).toBe('caption');
  });

  it('never changes a caption request or a control that is not a slider', () => {
    expect(labelModeOf(presented('brightness'), 'caption', 1000)).toBe('caption');
    expect(labelModeOf(presented('target_temperature'), 'inline', 100)).toBe('inline');
  });
});
