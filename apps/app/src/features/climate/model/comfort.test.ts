import { describe, expect, it } from 'vitest';
import type { DeviceCapability } from '@smarteverything/domain';
import type { Device, DeviceValues } from '../../../store/state';
import { deviceModelOf } from '../../devices';
import { comfortOf, readingsOf, type ComfortMetric, type MetricReading } from './comfort';
import type { ClimateSource } from './climate-devices';

const KEYS: readonly ComfortMetric[] = ['temperature', 'humidity', 'pm25', 'co2'];

function sensor(id: string, room: string | null, online = true): Device {
  const capabilities: DeviceCapability[] = KEYS.map((key) => ({
    key,
    label: key,
    access: 'read',
    value: { kind: 'number', min: 0, max: 5000, step: 1 },
  }));
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
    room_id: room,
    online,
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

function source(
  id: string,
  room: string | null,
  readings: Partial<Record<ComfortMetric, number>>,
  online = true,
): ClimateSource {
  const values: Record<string, DeviceValues[string]> = {};
  for (const [key, value] of Object.entries(readings)) {
    values[key] = { value, observedAt: '2026-10-16T10:00:00Z' };
  }
  return { model: deviceModelOf(sensor(id, room, online)), values };
}

describe('readingsOf', () => {
  it('judges the temperature against the comfortable band', () => {
    const verdict = (value: number): string | undefined =>
      readingsOf([source('a', null, { temperature: value })], ['temperature'])[0]?.verdict;
    expect(verdict(18.9)).toBe('Cool');
    expect(verdict(19)).toBe('Comfortable');
    expect(verdict(25)).toBe('Comfortable');
    expect(verdict(25.1)).toBe('Warm');
  });

  it('judges humidity and CO2 with their own bands', () => {
    const one = (metric: ComfortMetric, value: number): MetricReading | undefined =>
      readingsOf([source('a', null, { [metric]: value })], [metric])[0];
    expect(one('humidity', 34)?.verdict).toBe('Dry');
    expect(one('humidity', 66)?.verdict).toBe('Humid');
    expect(one('co2', 1000)).toMatchObject({ verdict: 'Fresh', tone: 'positive' });
    expect(one('co2', 1001)).toMatchObject({ verdict: 'Stuffy', tone: 'warning' });
  });

  it('judges fine dust by air band', () => {
    const [dust] = readingsOf([source('a', null, { pm25: 60 })], ['pm25']);
    expect(dust).toMatchObject({ verdict: 'Poor air', tone: 'critical' });
  });

  it('averages the online sensors and ignores an offline one', () => {
    const sources = [
      source('a', null, { temperature: 20 }),
      source('b', null, { temperature: 24 }),
      source('c', null, { temperature: 40 }, false),
    ];
    const [reading] = readingsOf(sources, ['temperature']);
    expect(reading).toMatchObject({ amount: 22, value: '22.0', stale: false });
  });

  it('shows the last values as stale when every sensor is offline', () => {
    const [reading] = readingsOf([source('a', null, { humidity: 50 }, false)], ['humidity']);
    expect(reading).toMatchObject({ amount: 50, stale: true });
  });

  it('skips a metric that no sensor reports', () => {
    const readings = readingsOf([source('a', null, { temperature: 21 })], KEYS);
    expect(readings.map((reading) => reading.metric)).toEqual(['temperature']);
  });
});

describe('comfortOf', () => {
  const rooms = [
    { id: 'living', name: 'Living room' },
    { id: 'bed', name: 'Bedroom' },
  ];

  it('gives each room with readings its own block when there are two or more', () => {
    const sources = [
      source('a', 'living', { temperature: 21 }),
      source('b', 'bed', { temperature: 18 }),
    ];
    const blocks = comfortOf(sources, rooms, ['temperature']);
    expect(blocks.map((block) => block.room)).toEqual(['Living room', 'Bedroom']);
    expect(blocks[1]?.readings[0]?.verdict).toBe('Cool');
  });

  it('gives one home-wide block when fewer than two rooms have readings', () => {
    const sources = [
      source('a', 'living', { temperature: 21 }),
      source('b', null, { temperature: 23 }),
    ];
    const blocks = comfortOf(sources, rooms, ['temperature']);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ roomId: null, room: null });
    expect(blocks[0]?.readings[0]?.amount).toBe(22);
  });

  it('has no block without any reading', () => {
    expect(comfortOf([], rooms, ['temperature'])).toEqual([]);
  });
});
