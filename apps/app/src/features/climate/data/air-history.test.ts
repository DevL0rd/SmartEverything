import type { DeviceCapability, HistoryRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { Device } from '../../../store/state';
import { deviceModelOf } from '../../devices';
import { metricSources, seriesOf, shouldFit } from './air-history';

const OBSERVED = Date.parse('2026-10-16T10:00:00.000Z');

function sensor(id: string): Device {
  const capabilities: DeviceCapability[] = [
    {
      key: 'pm25',
      label: 'PM2.5',
      access: 'read',
      value: { kind: 'number', min: 0, max: 500, step: 1 },
    },
  ];
  return {
    id,
    provider: 'local',
    external_id: id,
    parent_id: null,
    kind: 'sensor',
    name: id,
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
    label: id,
  };
}

function sourcesOf(ids: readonly string[]): ReturnType<typeof metricSources> {
  return metricSources(
    ids.map((id) => deviceModelOf(sensor(id))),
    'pm25',
  );
}

function row(deviceId: string, value: number, minutes = 0): HistoryRow {
  return {
    id: 1,
    device_id: deviceId,
    capability: 'pm25',
    value,
    observed_at: new Date(OBSERVED + minutes * 60_000).toISOString(),
  };
}

describe('air history series', () => {
  it('keeps a device colour when another device has no data', () => {
    const sources = sourcesOf(['a', 'b', 'c']);
    const all = seriesOf([row('a', 1), row('b', 2), row('c', 3)], sources, 'pm25', '24h');
    const withoutB = seriesOf([row('a', 1), row('c', 3)], sources, 'pm25', '24h');
    expect(all.map((entry) => entry.label)).toEqual(['a', 'b', 'c']);
    expect(withoutB.map((entry) => entry.colour)).toEqual([all[0]?.colour, all[2]?.colour]);
  });

  it('colours by device order whatever order the sources arrive in', () => {
    const rows = [row('a', 1), row('b', 2)];
    const forward = seriesOf(rows, sourcesOf(['a', 'b']), 'pm25', '24h');
    const backward = seriesOf(rows, sourcesOf(['b', 'a']), 'pm25', '24h');
    expect(backward).toEqual(forward);
  });

  it('uses the metric colour for a single device', () => {
    const [only] = seriesOf([row('a', 1)], sourcesOf(['a']), 'pm25', '24h');
    expect(only?.colour).toBe('viz-1');
  });

  it('folds devices beyond the palette into one Other series', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const series = seriesOf(
      ids.map((id, index) => row(id, index * 10)),
      sourcesOf(ids),
      'pm25',
      '24h',
    );
    expect(series.map((entry) => entry.label)).toEqual(['a', 'b', 'c', 'd', 'e', 'Other']);
    expect(new Set(series.map((entry) => entry.colour)).size).toBe(6);
    expect(series[5]?.points[0]?.v).toBe((50 + 60 + 70) / 3);
  });

  it('fits the chart to the data when it covers under half the range', () => {
    const sources = sourcesOf(['a']);
    const few = seriesOf([row('a', 1), row('a', 2, 60)], sources, 'pm25', '24h');
    expect(shouldFit(few, '24h')).toBe(true);
    expect(shouldFit([], '24h')).toBe(false);
  });
});
