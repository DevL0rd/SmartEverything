import { describe, expect, it } from 'vitest';
import { JSON_VALUE, pluginStreamKey } from '@smarteverything/domain';
import {
  SHELLY_PLUGIN_ID,
  SHELLY_SNAPSHOT_STREAM,
  type ShellyAction,
} from '@smarteverything/shelly';
import { presenceFixture } from '../plugins/shelly-presence/presence-fixture';
import { makeTable, type Device, type StoreState } from '../store/state';
import { sameSearchDevices, sameSearchStreams } from './table-equality';

const FULL = [
  'wifi_scan',
  'schedule_create',
  'kvs_set',
  'schedule_update',
  'add_zone',
  'set_presence',
] as const;

const sensor = presenceFixture({ actions: [...FULL] });

const DEVICE: Device = {
  id: 'device-1',
  provider: 'local',
  external_id: sensor.externalId,
  parent_id: null,
  kind: 'sensor',
  name: 'Hall radar',
  display_name: null,
  model: 'Test',
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
  label: 'Hall radar',
};

const devices = makeTable({ [DEVICE.id]: DEVICE }, [DEVICE.id], 1);

function streams(
  at: string,
  actions: readonly ShellyAction[],
): StoreState['tables']['plugin_streams'] {
  const key = pluginStreamKey(SHELLY_PLUGIN_ID, SHELLY_SNAPSHOT_STREAM);
  const raw: unknown = JSON.parse(
    JSON.stringify({ at, devices: [presenceFixture({ actions: [...actions] })] }),
  );
  const row = {
    plugin_id: SHELLY_PLUGIN_ID,
    stream: SHELLY_SNAPSHOT_STREAM,
    value: JSON_VALUE.parse(raw),
    at,
  };
  return makeTable({ [key]: row }, [key], 1);
}

describe('sameSearchStreams', () => {
  it('ignores stream updates that leave the searchable text unchanged', () => {
    const first = streams('2026-10-17T00:00:00.000Z', [...FULL]);
    const later = streams('2026-10-17T00:00:05.000Z', [...FULL]);
    expect(first).not.toBe(later);
    expect(sameSearchStreams(devices, first, later)).toBe(true);
  });

  it('notices stream updates that change the searchable text', () => {
    const first = streams('2026-10-17T00:00:00.000Z', []);
    const later = streams('2026-10-17T00:00:05.000Z', [...FULL]);
    expect(sameSearchStreams(devices, first, later)).toBe(false);
  });
});

describe('sameSearchDevices', () => {
  it('ignores a bare updated_at bump', () => {
    const bumped = { ...DEVICE, updated_at: '2026-10-17T00:00:00.000Z' };
    expect(sameSearchDevices(devices, makeTable({ [DEVICE.id]: bumped }, [DEVICE.id], 2))).toBe(
      true,
    );
  });

  it('notices a rename, a visibility change and a different count', () => {
    const renamed = { ...DEVICE, display_name: 'Lounge radar' };
    expect(sameSearchDevices(devices, makeTable({ [DEVICE.id]: renamed }, [DEVICE.id], 2))).toBe(
      false,
    );
    const hidden = { ...DEVICE, hidden: true };
    expect(sameSearchDevices(devices, makeTable({ [DEVICE.id]: hidden }, [DEVICE.id], 2))).toBe(
      false,
    );
    expect(sameSearchDevices(devices, makeTable({}, [], 2))).toBe(false);
  });
});
