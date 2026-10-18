import { describe, expect, it } from 'vitest';
import { deviceOf, type Device } from '../../../store/state';
import { packRows, sameRow, type PackedRow } from './row-pack';

function device(id: string): Device {
  return deviceOf({
    id,
    provider: 'xiaomi',
    external_id: id,
    parent_id: null,
    kind: 'light',
    name: id,
    display_name: null,
    model: 'test.model',
    manufacturer: 'Test',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: [],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
}

const LAMP = device('lamp');
const FAN = device('fan');
const PLUG = device('plug');

function row(devices: readonly Device[]): PackedRow {
  return { key: devices.map((entry) => entry.id).join(','), devices };
}

describe('packing devices into rows', () => {
  it('puts one device per row when a single tile fits', () => {
    expect(packRows([LAMP, FAN, PLUG], 1).map((entry) => entry.key)).toEqual([
      'lamp',
      'fan',
      'plug',
    ]);
  });

  it('keeps the device order and leaves the last row short', () => {
    expect(packRows([LAMP, FAN, PLUG], 2).map((entry) => entry.key)).toEqual(['lamp,fan', 'plug']);
  });

  it('has no rows for no devices', () => {
    expect(packRows([], 2)).toEqual([]);
  });
});

describe('row identity for the grid row memo', () => {
  it('treats a rebuilt row with the same devices as unchanged', () => {
    expect(sameRow(row([LAMP]), row([LAMP]))).toBe(true);
  });

  it('sees a different device object in a row', () => {
    expect(sameRow(row([LAMP]), row([device('lamp')]))).toBe(false);
  });

  it('sees added and swapped devices', () => {
    expect(sameRow(row([LAMP]), row([LAMP, FAN]))).toBe(false);
    expect(sameRow(row([LAMP]), row([FAN]))).toBe(false);
  });
});
