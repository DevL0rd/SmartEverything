import { describe, expect, it } from 'vitest';
import type { DeviceCapability } from '@smarteverything/domain';
import type { Device } from '../../../store/state';
import { deviceModelOf, type DeviceModel } from './device-model';
import { HISTORY_RANGES, RANGE_HOURS, historyMetrics } from './history-model';

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

function number(
  key: DeviceCapability['key'],
  access: DeviceCapability['access'] = 'read',
): DeviceCapability {
  return { key, label: key, access, value: { kind: 'number', min: 0, max: 100, step: 1 } };
}

const MODEL = modelOf('air_purifier', [
  number('target_temperature', 'read_write'),
  number('temperature'),
  number('humidity'),
  number('filter_life'),
  number('signal_strength'),
  number('raw:custom_extra'),
  { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
  number('power_draw'),
]);

function keys(extras: boolean): string[] {
  return historyMetrics(MODEL.presentation, extras).map((metric) => metric.key);
}

describe('historyMetrics', () => {
  it('charts numeric readings, controls and maintenance values, readings first', () => {
    const shown = keys(false);
    expect(shown.slice(0, 3).toSorted()).toEqual(['humidity', 'power_draw', 'temperature']);
    expect(shown.slice(3)).toEqual(['target_temperature', 'filter_life']);
  });

  it('leaves out booleans, diagnostics and extras unless extras are asked for', () => {
    expect(keys(false)).not.toContain('power');
    expect(keys(false)).not.toContain('signal_strength');
    expect(keys(false)).not.toContain('raw:custom_extra');
    expect(keys(true)).toEqual([...keys(false), 'raw:custom_extra']);
  });
});

describe('ranges', () => {
  it('has one hour count for each range choice', () => {
    expect(HISTORY_RANGES.map((range) => range.value)).toEqual(['24h', '7d', '30d']);
    expect(HISTORY_RANGES.map((range) => RANGE_HOURS[range.value])).toEqual([24, 168, 720]);
  });
});
