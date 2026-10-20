import { describe, expect, it } from 'vitest';
import {
  DEVICE_CAPABILITY,
  PLUGIN_ID,
  SIGNAL_SOURCES,
  TRIGGER_GROUPS,
  presentDevice,
  searchTriggerCatalogue,
  triggerCatalogue,
  type CatalogueDevice,
  type CatalogueInventory,
  type DeviceCapability,
  type SignalSourceSpec,
  type TriggerRow,
} from '../src';

function capability(
  key: string,
  label: string,
  value: Record<string, unknown>,
  access = 'read_write',
): DeviceCapability {
  return DEVICE_CAPABILITY.parse({ key, label, access, value });
}

const LAMP: CatalogueDevice = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Reading lamp',
  roomId: 'room-living',
  kind: 'light',
  model: 'lamp.one',
  capabilities: [
    capability('power', 'Power', { kind: 'boolean' }),
    capability('brightness', 'Brightness', { kind: 'number', min: 0, max: 100, step: 1 }),
    capability(
      'signal_strength',
      'Signal strength',
      { kind: 'number', min: -100, max: 0, step: 1 },
      'read',
    ),
    capability('raw:reboot', 'Reboot', { kind: 'action' }, 'write'),
  ],
};

const DOOR: CatalogueDevice = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Back door',
  roomId: 'room-hall',
  kind: 'sensor',
  model: 'door.one',
  capabilities: [capability('contact', 'Door', { kind: 'boolean' }, 'read')],
};

const CAMERA: CatalogueDevice = {
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Driveway camera',
  roomId: null,
  kind: 'camera',
  model: 'cam.one',
  capabilities: [capability('privacy_mode', 'Privacy', { kind: 'boolean' })],
};

const INVENTORY: CatalogueInventory = {
  devices: [LAMP, DOOR, CAMERA],
  rooms: [
    { id: 'room-living', name: 'Living room' },
    { id: 'room-hall', name: 'Hallway' },
  ],
  people: [],
  chats: [],
};

const PLUGIN = PLUGIN_ID.parse('my-router');

const PLUGIN_SPEC: SignalSourceSpec = {
  source: 'plugin_my_router',
  label: 'Router',
  kinds: [
    {
      kind: 'client_joined',
      label: 'A client joins',
      subject: 'none',
      fields: [],
      match: [{ key: 'mac', label: 'Hardware address', values: null }],
      pulse: true,
    },
  ],
};

const SOURCES: readonly SignalSourceSpec[] = [...SIGNAL_SOURCES, PLUGIN_SPEC];

const CATALOGUE = triggerCatalogue(SOURCES, INVENTORY, [{ id: PLUGIN, name: 'Home router' }]);

function rowsOf(source: string, kind: string): TriggerRow[] {
  return CATALOGUE.rows.filter((row) => row.source === source && row.kind === kind);
}

describe('triggerCatalogue', () => {
  it('lists every kind of every source once as a summary row', () => {
    for (const source of SOURCES) {
      for (const spec of source.kinds) {
        const summaries = rowsOf(source.source, spec.kind).filter((row) => row.subject === null);
        expect(summaries, `${source.source}/${spec.kind}`).toHaveLength(1);
        expect(summaries[0]?.label).toBe(spec.label);
      }
    }
  });

  it('adds a row for every readable value of every device and none for write-only actions', () => {
    const rows = rowsOf('device', 'state').filter((row) => row.subject !== null);
    expect(rows.map((row) => `${String(row.subject)}|${String(row.field)}`).sort()).toStrictEqual(
      [
        `${LAMP.id}|brightness`,
        `${LAMP.id}|power`,
        `${DOOR.id}|contact`,
        `${CAMERA.id}|privacy_mode`,
      ].sort(),
    );
  });

  it('asks the presentation which values a person can pick, leaving out hidden and diagnostic ones', () => {
    const picked = presentDevice(LAMP)
      .capabilities.filter(
        (entry) => entry.tier !== 'hidden' && entry.tier !== 'diagnostic' && entry.writable,
      )
      .map((entry) => entry.key);
    const keys = rowsOf('device', 'state')
      .filter((row) => row.subject === LAMP.id)
      .map((row) => row.field);
    expect(keys).toEqual(expect.arrayContaining(picked));
    expect(keys).not.toContain('raw:reboot');
  });

  it('names a device value row after the device, with its room, family and capability words', () => {
    const row = rowsOf('device', 'state').find((entry) => entry.field === 'brightness');
    expect(row).toMatchObject({
      label: 'Reading lamp Brightness',
      room: 'Living room',
      roomId: 'room-living',
      group: 'devices',
      pulse: false,
    });
    expect(row?.keywords).toEqual(
      expect.arrayContaining(['Reading lamp', 'Living room', 'Brightness', 'Light']),
    );
  });

  it('puts camera and plugin rows in their own groups', () => {
    expect(rowsOf('device', 'state').find((row) => row.subject === CAMERA.id)?.group).toBe(
      'cameras',
    );
    expect(rowsOf('plugin_my_router', 'client_joined')[0]?.group).toBe('network');
    expect(rowsOf('event', 'person')[0]?.group).toBe('cameras');
    expect(rowsOf('weather', 'forecast')[0]?.group).toBe('time');
  });

  it('names a plugin row after the installed plugin and finds it by that name', () => {
    const row = rowsOf('plugin_my_router', 'client_joined')[0];
    expect(row?.sourceLabel).toBe('Home router');
    expect(row?.keywords).toContain('Home router');
    expect(searchTriggerCatalogue(CATALOGUE, { query: 'home router' })).toContain(row);
  });

  it('orders rows by group and only uses known groups', () => {
    const order = CATALOGUE.rows.map((row) => TRIGGER_GROUPS.indexOf(row.group));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toStrictEqual(order);
  });

  it('offers the ways that fit: pulses hide rises and falls, on-off values use becomes, numbers add both', () => {
    expect(rowsOf('event', 'person')[0]?.hows).toStrictEqual([
      'happens',
      'times_in',
      'first',
      'quiet',
    ]);
    const power = rowsOf('device', 'state').find((row) => row.field === 'power');
    expect(power?.states).toStrictEqual({ on: 'on', off: 'off' });
    expect(power?.hows).not.toContain('rises_above');
    expect(power?.hows).toContain('becomes');
    const brightness = rowsOf('device', 'state').find((row) => row.field === 'brightness');
    expect(brightness?.hows).toStrictEqual([
      'changes',
      'becomes',
      'rises_above',
      'falls_below',
      'stays',
      'times_in',
      'first',
      'quiet',
    ]);
  });

  it('gives labelled match values and the state words of an on-off kind', () => {
    const lifecycle = rowsOf('device', 'lifecycle')[0];
    const change = lifecycle?.match.find((entry) => entry.key === 'change');
    expect(change?.values).toContainEqual({ value: 'added', label: 'Added to the home' });
    expect(rowsOf('device', 'online')[0]?.states).toStrictEqual({
      on: 'online',
      off: 'offline',
    });
  });

  it('is empty of device rows when the home has no devices', () => {
    const bare = triggerCatalogue(SOURCES, { devices: [], rooms: [], people: [], chats: [] }, []);
    expect(bare.rows.filter((row) => row.subject !== null)).toStrictEqual([]);
    expect(bare.rows.length).toBeGreaterThan(0);
  });
});

describe('searchTriggerCatalogue', () => {
  const idsOf = (rows: readonly TriggerRow[]): string[] => rows.map((row) => row.id);

  it('finds the values of a device by its name', () => {
    const rows = searchTriggerCatalogue(CATALOGUE, { query: 'reading lamp' });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.filter((row) => row.subject === LAMP.id)).toHaveLength(2);
  });

  it('finds the values of every device in a room by the room name', () => {
    const rows = searchTriggerCatalogue(CATALOGUE, { query: 'living room' });
    const devices = new Set(rows.flatMap((row) => (row.subject === null ? [] : [row.subject])));
    expect([...devices]).toStrictEqual([LAMP.id]);
    const hall = searchTriggerCatalogue(CATALOGUE, { query: 'hallway' });
    expect(hall.map((row) => row.subject)).toStrictEqual([DOOR.id]);
  });

  it('needs every word, in any order and any case', () => {
    expect(idsOf(searchTriggerCatalogue(CATALOGUE, { query: 'BRIGHTNESS living' }))).toStrictEqual([
      `device|state|${LAMP.id}|brightness`,
    ]);
    expect(searchTriggerCatalogue(CATALOGUE, { query: 'brightness hallway' })).toStrictEqual([]);
  });

  it('finds a signal by what it does and by its match value labels', () => {
    const added = searchTriggerCatalogue(CATALOGUE, { query: 'added to the home' });
    expect(added.map((row) => `${row.source}/${row.kind}`)).toContain('device/lifecycle');
    const infant = searchTriggerCatalogue(CATALOGUE, { query: 'infant' });
    expect(infant.map((row) => `${row.source}/${row.kind}`)).toContain('event/sound');
  });

  it('narrows to one group and returns everything for an empty search', () => {
    const cameras = searchTriggerCatalogue(CATALOGUE, { group: 'cameras' });
    expect(cameras.length).toBeGreaterThan(0);
    expect(cameras.every((row) => row.group === 'cameras')).toBe(true);
    expect(searchTriggerCatalogue(CATALOGUE, {})).toStrictEqual(CATALOGUE.rows);
    expect(searchTriggerCatalogue(CATALOGUE, { query: '  ' })).toStrictEqual(CATALOGUE.rows);
    expect(searchTriggerCatalogue(CATALOGUE, { query: 'zzzz nothing' })).toStrictEqual([]);
  });
});
