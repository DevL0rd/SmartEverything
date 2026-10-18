import { describe, expect, it } from 'vitest';
import type { DeviceCapability } from '@smarteverything/domain';
import type { Device } from '../../../store/state';
import { controlCount, controlGroupsOf, extrasOf, settingsOf } from './control-groups';
import { deviceModelOf, type DeviceModel } from './device-model';

function modelOf(kind: Device['kind'], capabilities: DeviceCapability[]): DeviceModel {
  return deviceModelOf({
    id: 'd1',
    provider: 'local',
    external_id: 'd1',
    parent_id: null,
    kind,
    name: 'Device',
    display_name: null,
    model: 'generic',
    manufacturer: 'test',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities,
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
    label: 'Device',
  });
}

function cap(
  key: DeviceCapability['key'],
  access: DeviceCapability['access'] = 'read_write',
): DeviceCapability {
  return { key, label: key, access, value: { kind: 'boolean' } };
}

const MODEL = modelOf('air_purifier', [
  cap('power'),
  cap('oscillation'),
  cap('night_light'),
  cap('child_lock'),
  cap('buzzer', 'read'),
  cap('filter_life', 'read'),
  cap('raw:custom_extra'),
  cap('tank_empty'),
]);

function keys(items: readonly { readonly key: string }[]): string[] {
  return items.map((item) => item.key);
}

describe('controlGroupsOf', () => {
  it('lists writable primary and control capabilities but not the power switch', () => {
    const controls = controlGroupsOf(MODEL.presentation).flatMap((group) => keys(group.controls));
    expect(controls.toSorted()).toEqual(['night_light', 'oscillation']);
  });

  it('puts controls of the same group together under the label of the group', () => {
    const groups = controlGroupsOf(MODEL.presentation);
    const labels = groups.map((group) => group.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const group of groups) {
      expect(group.controls.every((control) => control.groupLabel === group.label)).toBe(true);
    }
  });

  it('counts the controls over all groups', () => {
    expect(controlCount(MODEL.presentation)).toBe(2);
  });

  it('is empty for a device with nothing to control', () => {
    const sensor = modelOf('sensor', [cap('temperature', 'read')]);
    expect(controlGroupsOf(sensor.presentation)).toEqual([]);
    expect(controlCount(sensor.presentation)).toBe(0);
  });
});

describe('settingsOf and extrasOf', () => {
  it('lists only the writable settings', () => {
    expect(keys(settingsOf(MODEL.presentation))).toEqual(['child_lock']);
  });

  it('lists the extras, writable or not', () => {
    expect(keys(extrasOf(MODEL.presentation))).toEqual(['raw:custom_extra']);
  });
});
