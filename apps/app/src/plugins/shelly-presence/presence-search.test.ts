import { describe, expect, it } from 'vitest';
import { JSON_VALUE, pluginStreamKey } from '@smarteverything/domain';
import { SHELLY_PLUGIN_ID, SHELLY_SNAPSHOT_STREAM } from '@smarteverything/shelly';
import { makeTable, type Device } from '../../store/state';
import { presenceFixture } from './presence-fixture';
import { presenceSearch } from './presence-search';

const sensor = presenceFixture({
  actions: [
    'wifi_scan',
    'schedule_create',
    'kvs_set',
    'schedule_update',
    'add_zone',
    'set_presence',
  ],
  components: [{ key: 'number:200', component: 'number', config: { name: 'Fan' } }],
});

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

function search(): ReturnType<typeof presenceSearch> {
  const key = pluginStreamKey(SHELLY_PLUGIN_ID, SHELLY_SNAPSHOT_STREAM);
  const raw: unknown = JSON.parse(
    JSON.stringify({ at: '2026-10-17T00:00:00.000Z', devices: [sensor] }),
  );
  const row = {
    plugin_id: SHELLY_PLUGIN_ID,
    stream: SHELLY_SNAPSHOT_STREAM,
    value: JSON_VALUE.parse(raw),
    at: '2026-10-17T00:00:00.000Z',
  };
  return presenceSearch(DEVICE, makeTable({ [key]: row }, [key], 1));
}

describe('presence search registry', () => {
  it('indexes pages, settings, actions and named resources from the catalogue', () => {
    const items = search();
    const titles = items.map((item) => item.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        'Presence detection',
        'Mounting height',
        'Scan nearby Wi-Fi networks',
        'Fan',
        'Desk',
      ]),
    );
  });

  it('opens creation flows on the page that owns them', () => {
    const byId = new Map(search().map((item) => [item.id, item]));
    expect(byId.get('schedule_create')?.query).toStrictEqual({ item: 'new' });
    expect(byId.get('kvs_set')?.query).toStrictEqual({ item: 'new' });
    expect(byId.get('add_zone')?.query).toStrictEqual({ focus: 'add-zone' });
    expect(byId.get('wifi_scan')?.query).toStrictEqual({ action: 'wifi_scan' });
  });

  it('does not index editor controls or settings actions as separate rows', () => {
    const ids = search().map((item) => item.id);
    expect(ids).not.toContain('set_presence');
    expect(ids).not.toContain('schedule_update');
    expect(search().some((item) => /undo|zoom|cursor|remove action/i.test(item.title))).toBe(false);
  });
});
