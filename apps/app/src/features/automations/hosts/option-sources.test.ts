import { OPTION_SOURCE_IDS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { deviceFixture } from '../../../store/device-fixture';
import { computersOf, phonesOf, referenceOptions } from './option-devices';
import {
  bluetoothDeviceRows,
  irButtonRows,
  irRemoteRows,
  keyboardLayoutRows,
  processRows,
  remoteNeedOf,
  serviceRows,
  signalRows,
  speechRows,
  startupAppRows,
  vacuumRoomRows,
  wifiNetworkRows,
  type SignalSourceLike,
} from './option-remote';
import { resolveOptions } from './option-sources';
import type { HomeData, OptionContext, OptionResult, RemoteState } from './option-types';

const STAMP = '2026-10-16T08:00:00.000Z';

const plug = deviceFixture(0, { id: 'plug', room_id: 'hall' });
const light = deviceFixture(1, { id: 'light', room_id: 'hall' });
const sensor = deviceFixture(3, { id: 'sensor', room_id: 'kitchen' });
const computer = deviceFixture(5, { id: 'desk', kind: 'computer', name: 'Desk', capabilities: [] });
const phone = deviceFixture(6, { id: 'pixel', kind: 'phone', name: 'Pixel', capabilities: [] });

const HOME: HomeData = {
  devices: [plug, light, sensor, computer, phone],
  rooms: [
    { id: 'hall', name: 'Hall' },
    { id: 'kitchen', name: 'Kitchen' },
  ],
  groups: [
    { id: 'lights', name: 'Lights', device_ids: ['light'], created_at: STAMP, updated_at: STAMP },
  ],
  scenes: [{ id: 'movie', name: 'Movie' }],
  people: [{ id: 'ann', name: 'Ann' }],
  chats: [{ id: 'chat', title: 'Morning' }],
  channels: [{ id: 'family', name: 'Family' }],
  values: [{ id: 'v1', content: { name: 'Guests' } }],
  automations: [{ id: 'a1', name: 'Night' }],
  timeZones: null,
};

const IDLE: RemoteState = { status: 'idle' };

function context(overrides: Partial<OptionContext> = {}): OptionContext {
  return { values: {}, target: [], search: '', ...overrides };
}

function ids(result: OptionResult): readonly string[] {
  return result.status === 'ready' ? result.options.map((option) => option.id) : [];
}

describe('computer and phone pickers', () => {
  it('list only computers in computer pickers and only phones in phone pickers', () => {
    expect(computersOf(HOME.devices).map((row) => row.id)).toEqual(['desk']);
    expect(phonesOf(HOME.devices).map((row) => row.id)).toEqual(['pixel']);
    expect(referenceOptions(HOME, 'computer', []).map((row) => row.id)).toEqual(['desk']);
    expect(referenceOptions(HOME, 'phone', []).map((row) => row.id)).toEqual(['pixel']);
  });
});

describe('computer and voice sources', () => {
  it('lists only computers for the computer source and the speech voices for voices', () => {
    expect(ids(resolveOptions('computers', context(), HOME, IDLE))).toEqual(['desk']);
    expect(ids(resolveOptions('voices', context(), HOME, IDLE)).length).toBeGreaterThan(0);
  });

  it('lists Talk channels by name and says why there are none', () => {
    expect(ids(resolveOptions('talk.channels', context(), HOME, IDLE))).toEqual(['family']);
    const none = resolveOptions('talk.channels', context(), { ...HOME, channels: [] }, IDLE);
    expect(none.status).toBe('unavailable');
  });

  it('says why phone sounds and app pages have no list', () => {
    for (const source of ['phone.sounds', 'app.pages'] as const) {
      const result = resolveOptions(source, context(), HOME, IDLE);
      expect(result.status).toBe('unavailable');
    }
  });
});

describe('capability filter of reference pickers', () => {
  it('lists only devices that hold every capability asked for', () => {
    const power = referenceOptions(HOME, 'device', ['power']).map((row) => row.id);
    expect(power).toEqual(['plug', 'light']);
    const both = referenceOptions(HOME, 'device', ['power', 'power_draw']).map((row) => row.id);
    expect(both).toEqual(['plug']);
  });

  it('lists rooms and groups only when one of their devices qualifies', () => {
    const rows = referenceOptions(HOME, 'target', ['temperature']).map((row) => row.id);
    expect(rows).toEqual(['sensor', 'kitchen']);
    const lights = referenceOptions(HOME, 'target', ['power']).map((row) => row.id);
    expect(lights).toEqual(['plug', 'light', 'hall', 'lights']);
  });
});

describe('control sources', () => {
  it('lists the controls of a device with their labels', () => {
    const result = resolveOptions('device.controls', context({ target: ['plug'] }), HOME, IDLE);
    expect(ids(result)).toContain('power');
    expect(ids(result)).toContain('power_draw');
  });

  it('lists only writable controls for the writable source', () => {
    const result = resolveOptions(
      'device.writable_controls',
      context({ target: ['plug'] }),
      HOME,
      IDLE,
    );
    expect(ids(result)).toContain('power');
    expect(ids(result)).not.toContain('power_draw');
  });

  it('reads the controls of every device in a room', () => {
    const result = resolveOptions('device.controls', context({ target: ['hall'] }), HOME, IDLE);
    expect(ids(result)).toContain('power');
    expect(ids(result)).toContain('power_draw');
  });

  it('lists the controls of every device when the whole home is meant', () => {
    const result = resolveOptions('device.controls', context({ wholeHome: true }), HOME, IDLE);
    expect(ids(result)).toContain('power');
    expect(ids(result)).toContain('temperature');
  });

  it('prefers the picked target over the whole home', () => {
    const result = resolveOptions(
      'device.controls',
      context({ target: ['sensor'], wholeHome: true }),
      HOME,
      IDLE,
    );
    expect(ids(result)).toContain('temperature');
    expect(ids(result)).not.toContain('power');
  });

  it('says what is missing until a target and a control are picked', () => {
    expect(resolveOptions('device.controls', context(), HOME, IDLE)).toEqual({
      status: 'unavailable',
      reason: 'Pick the device, room or group first',
    });
    expect(resolveOptions('device.enum_values', context({ target: ['plug'] }), HOME, IDLE)).toEqual(
      { status: 'unavailable', reason: 'Pick the control first' },
    );
  });
});

describe('climate sources', () => {
  const conditioner = deviceFixture(0, {
    id: 'ac',
    capabilities: [
      {
        key: 'hvac_mode',
        label: 'Mode',
        access: 'read_write',
        value: { kind: 'enum', options: ['cool', 'heat'] },
      },
      {
        key: 'fan_mode',
        label: 'Fan',
        access: 'read_write',
        value: { kind: 'enum', options: ['low', 'high'] },
      },
      {
        key: 'swing',
        label: 'Swing',
        access: 'read_write',
        value: { kind: 'enum', options: ['off', 'vertical'] },
      },
    ],
  });
  const home: HomeData = { ...HOME, devices: [...HOME.devices, conditioner] };

  it('lists the options of the fixed control for mode, fan and swing without a control port', () => {
    const at = (
      source: 'climate.modes' | 'climate.fan_modes' | 'climate.swing_modes',
    ): readonly string[] => ids(resolveOptions(source, context({ target: ['ac'] }), home, IDLE));
    expect(at('climate.modes')).toEqual(['cool', 'heat']);
    expect(at('climate.fan_modes')).toEqual(['low', 'high']);
    expect(at('climate.swing_modes')).toEqual(['off', 'vertical']);
  });

  it('asks for a target first', () => {
    expect(resolveOptions('climate.modes', context(), home, IDLE)).toEqual({
      status: 'unavailable',
      reason: 'Pick the device, room or group first',
    });
  });
});

describe('camera sources', () => {
  const camera = deviceFixture(0, {
    id: 'porch',
    kind: 'camera',
    capabilities: [
      {
        key: 'ptz_preset',
        label: 'Saved position',
        access: 'read_write',
        value: { kind: 'enum', options: ['Door', 'Gate'] },
      },
      {
        key: 'night_vision',
        label: 'Night vision',
        access: 'read_write',
        value: { kind: 'enum', options: ['on', 'off', 'auto'] },
      },
    ],
  });
  const home: HomeData = { ...HOME, devices: [...HOME.devices, camera] };

  it('lists the saved positions and night vision settings of the picked camera', () => {
    const at = (source: 'camera.presets' | 'camera.night_vision'): readonly string[] =>
      ids(resolveOptions(source, context({ target: ['porch'] }), home, IDLE));
    expect(at('camera.presets')).toEqual(['Door', 'Gate']);
    expect(at('camera.night_vision')).toEqual(['on', 'off', 'auto']);
  });

  it('lists night vision of every camera when the whole home is meant', () => {
    expect(
      ids(resolveOptions('camera.night_vision', context({ wholeHome: true }), home, IDLE)),
    ).toEqual(['on', 'off', 'auto']);
  });

  it('says why a camera without the setting or without a pick has no options', () => {
    expect(resolveOptions('camera.presets', context({ target: ['plug'] }), home, IDLE)).toEqual({
      status: 'unavailable',
      reason: 'The camera has no saved positions',
    });
    expect(resolveOptions('camera.presets', context(), home, IDLE)).toEqual({
      status: 'unavailable',
      reason: 'Pick the device, room or group first',
    });
  });
});

describe('home sources', () => {
  it('lists scenes, people, rooms, groups, chats, Values and automations by name', () => {
    expect(ids(resolveOptions('scenes', context(), HOME, IDLE))).toEqual(['movie']);
    expect(ids(resolveOptions('people', context(), HOME, IDLE))).toEqual(['ann']);
    expect(ids(resolveOptions('rooms', context(), HOME, IDLE))).toEqual(['hall', 'kitchen']);
    expect(ids(resolveOptions('groups', context(), HOME, IDLE))).toEqual(['lights']);
    expect(ids(resolveOptions('chats', context(), HOME, IDLE))).toEqual(['chat']);
    expect(ids(resolveOptions('values', context(), HOME, IDLE))).toEqual(['v1']);
    expect(ids(resolveOptions('automations', context(), HOME, IDLE))).toEqual(['a1']);
  });

  it('searches labels, details and ids', () => {
    const result = resolveOptions('rooms', context({ search: ' KIT' }), HOME, IDLE);
    expect(ids(result)).toEqual(['kitchen']);
  });

  it('needs the automation for variables, triggers, timers and events', () => {
    for (const source of ['variables', 'triggers.this', 'timers.this', 'events.emitted'] as const) {
      expect(resolveOptions(source, context(), HOME, IDLE)).toEqual({
        status: 'unavailable',
        reason: 'Needs the automation being edited',
      });
    }
    const scope = {
      variables: [{ id: 'count', label: 'Count' }],
      triggers: [],
      timers: [],
      events: [],
    };
    const result = resolveOptions('variables', context({ scope }), HOME, IDLE);
    expect(ids(result)).toEqual(['count']);
  });

  it('reports a device that cannot list time zones instead of guessing', () => {
    expect(resolveOptions('time_zones', context(), HOME, IDLE)).toEqual({
      status: 'unavailable',
      reason: 'This device cannot list time zones',
    });
    const zoned = { ...HOME, timeZones: ['Asia/Bangkok'] };
    expect(ids(resolveOptions('time_zones', context(), zoned, IDLE))).toEqual(['Asia/Bangkok']);
  });
});

describe('sources without a data path', () => {
  it('say why, never offer fake options', () => {
    expect(resolveOptions('device.labels', context(), HOME, IDLE).status).toBe('unavailable');
  });
});

describe('remote sources', () => {
  it('wait for the picked parent before asking the hub', () => {
    expect(remoteNeedOf('ir.buttons', context())).toEqual({
      kind: 'blocked',
      reason: 'Pick the remote first',
    });
    expect(remoteNeedOf('ir.buttons', context({ values: { remote: 'r1' } }))).toEqual({
      kind: 'fetch',
      fetch: { t: 'ir_buttons', remoteId: 'r1' },
    });
    expect(remoteNeedOf('signal.kinds', context())).toEqual({
      kind: 'blocked',
      reason: 'Pick the source first',
    });
    expect(remoteNeedOf('signal.fields', context({ values: { source: 'weather' } }))).toEqual({
      kind: 'blocked',
      reason: 'Pick the kind of signal first',
    });
  });

  it('ask for the computer or phone that was picked, or the picked target', () => {
    expect(remoteNeedOf('computer.apps', context({ values: { computer: 'desk' } }))).toEqual({
      kind: 'fetch',
      fetch: { t: 'computer_apps', deviceId: 'desk' },
    });
    expect(remoteNeedOf('phone.apps', context({ target: ['pixel'] }))).toEqual({
      kind: 'fetch',
      fetch: { t: 'phone_apps', deviceId: 'pixel' },
    });
    expect(remoteNeedOf('computer.displays', context())).toEqual({
      kind: 'blocked',
      reason: 'Pick the computer first',
    });
  });

  it('asks the hub for appliances, and for the services and processes of the picked computer', () => {
    expect(remoteNeedOf('ir.appliances', context())).toEqual({
      kind: 'fetch',
      fetch: { t: 'ir_appliances' },
    });
    expect(remoteNeedOf('computer.services', context({ values: { computer: 'desk' } }))).toEqual({
      kind: 'fetch',
      fetch: { t: 'services', deviceId: 'desk' },
    });
    expect(
      remoteNeedOf(
        'computer.processes',
        context({ values: { computer: 'desk' }, search: ' fire ' }),
      ),
    ).toEqual({
      kind: 'fetch',
      fetch: { t: 'processes', deviceId: 'desk', search: 'fire' },
    });
    expect(remoteNeedOf('computer.processes', context())).toEqual({
      kind: 'blocked',
      reason: 'Pick the computer first',
    });
    expect(remoteNeedOf('computer.services', context())).toEqual({
      kind: 'blocked',
      reason: 'Pick the computer first',
    });
  });

  it('asks the hub for the keyboard layouts and startup apps of the picked computer', () => {
    expect(
      remoteNeedOf('computer.keyboard_layouts', context({ values: { computer: 'desk' } })),
    ).toEqual({ kind: 'fetch', fetch: { t: 'keyboard_layouts', deviceId: 'desk' } });
    expect(
      remoteNeedOf('computer.startup_apps', context({ values: { computer: 'desk' } })),
    ).toEqual({ kind: 'fetch', fetch: { t: 'startup_apps', deviceId: 'desk' } });
    expect(remoteNeedOf('computer.keyboard_layouts', context())).toEqual({
      kind: 'blocked',
      reason: 'Pick the computer first',
    });
  });

  it('lists keyboard layouts and startup apps from the rows the computer reported', () => {
    expect(
      keyboardLayoutRows(
        [
          { id: 'us', name: 'English (US)' },
          { id: 'de', name: 'German' },
        ],
        'de',
      ),
    ).toEqual([
      { id: 'us', label: 'English (US)' },
      { id: 'de', label: 'German', detail: 'In use now' },
    ]);
    expect(
      startupAppRows([
        { id: 'steam', name: 'Steam', enabled: true },
        { id: 'slack', name: 'Slack', enabled: false },
      ]),
    ).toEqual([
      { id: 'steam', label: 'Steam', detail: 'Starts at sign-in' },
      { id: 'slack', label: 'Slack', detail: 'Does not start' },
    ]);
  });

  it('asks the hub for the Wi-Fi networks and Bluetooth devices of the picked computer', () => {
    expect(remoteNeedOf('computer.networks', context({ values: { computer: 'desk' } }))).toEqual({
      kind: 'fetch',
      fetch: { t: 'wifi_networks', deviceId: 'desk' },
    });
    expect(
      remoteNeedOf('computer.bluetooth_devices', context({ values: { computer: 'desk' } })),
    ).toEqual({ kind: 'fetch', fetch: { t: 'bluetooth_devices', deviceId: 'desk' } });
    expect(remoteNeedOf('computer.networks', context())).toEqual({
      kind: 'blocked',
      reason: 'Pick the computer first',
    });
  });

  it('lists only the saved Wi-Fi networks and every Bluetooth device the computer reported', () => {
    expect(
      wifiNetworkRows([
        { ssid: 'Home', known: true, connected: true },
        { ssid: 'Cafe', known: false, connected: false },
        { ssid: 'Office', known: true, connected: false },
      ]),
    ).toEqual([
      { id: 'Home', label: 'Home', detail: 'Connected now' },
      { id: 'Office', label: 'Office' },
    ]);
    expect(
      bluetoothDeviceRows([
        { id: 'aa:01', name: 'Headphones', connected: true },
        { id: 'aa:02', name: 'Keyboard', connected: false },
      ]),
    ).toEqual([
      { id: 'aa:01', label: 'Headphones', detail: 'Connected' },
      { id: 'aa:02', label: 'Keyboard', detail: 'Not connected' },
    ]);
  });

  it('resolves the computer pickers from the fetched rows', () => {
    const rows = wifiNetworkRows([{ ssid: 'Home', known: true, connected: false }]);
    expect(
      resolveOptions('computer.networks', context({ values: { computer: 'desk' } }), HOME, {
        status: 'ready',
        rows,
      }),
    ).toEqual({ status: 'ready', options: [{ id: 'Home', label: 'Home' }] });
  });

  it('lists these sources from the hub rows instead of reporting no list', () => {
    const appliances = resolveOptions('ir.appliances', context(), HOME, {
      status: 'ready',
      rows: irRemoteRows([{ id: 'ac', name: 'Bedroom AC', category: 'ac', brand: 'Daikin' }]),
    });
    expect(appliances).toEqual({
      status: 'ready',
      options: [{ id: 'ac', label: 'Bedroom AC', detail: 'Daikin ac' }],
    });
    const services = resolveOptions(
      'computer.services',
      context({ values: { computer: 'desk' } }),
      HOME,
      {
        status: 'ready',
        rows: serviceRows([{ unit: 'sshd.service', description: '' }]),
      },
    );
    expect(services).toEqual({
      status: 'ready',
      options: [{ id: 'sshd.service', label: 'sshd.service' }],
    });
    expect(processRows([{ pid: 42, name: 'firefox', user: 'ann' }])).toEqual([
      { id: '42', label: 'firefox', detail: 'ann 42' },
    ]);
    expect(
      resolveOptions('computer.processes', context({ values: { computer: 'desk' } }), HOME, {
        status: 'loading',
      }),
    ).toEqual({ status: 'loading' });
  });

  it('shows loading, failure reasons and rows as they arrive', () => {
    const ask = context({ values: { remote: 'r1' } });
    expect(resolveOptions('ir.buttons', ask, HOME, { status: 'loading' })).toEqual({
      status: 'loading',
    });
    expect(
      resolveOptions('ir.buttons', ask, HOME, { status: 'failed', reason: 'Offline' }),
    ).toEqual({ status: 'unavailable', reason: 'Offline' });
    const rows = [
      { id: 'power', label: 'power' },
      { id: 'mute', label: 'mute' },
    ];
    const found = resolveOptions('ir.buttons', { ...ask, search: 'mu' }, HOME, {
      status: 'ready',
      rows,
    });
    expect(ids(found)).toEqual(['mute']);
  });

  it('does not ask the hub for a plugin list without the plugin', () => {
    expect(remoteNeedOf('plugin.entity', context())).toEqual({
      kind: 'blocked',
      reason: 'Needs the plugin that lists these',
    });
  });

  it('maps hub data to rows', () => {
    const codes = [
      { remote_id: 'r1', button: 'power' },
      { remote_id: 'r1', button: 'power' },
      { remote_id: 'r2', button: 'mute' },
    ];
    expect(irButtonRows(codes, 'r1')).toEqual([{ id: 'power', label: 'power' }]);
    const sources: readonly SignalSourceLike[] = [
      {
        source: 'weather',
        label: 'Weather',
        kinds: [
          {
            kind: 'band',
            label: 'Band',
            subject: 'home',
            fields: [{ field: 'temperature', label: 'Temperature', unit: 'C' }],
          },
        ],
      },
    ];
    expect(signalRows(sources, 'sources', '', '')).toEqual([{ id: 'weather', label: 'Weather' }]);
    expect(signalRows(sources, 'kinds', 'weather', '')).toEqual([{ id: 'band', label: 'Band' }]);
    expect(signalRows(sources, 'fields', 'weather', 'band')).toEqual([
      { id: 'temperature', label: 'Temperature', detail: 'C' },
    ]);
    expect(signalRows(sources, 'fields', 'weather', 'none')).toEqual([]);
    expect(speechRows([{ source: { kind: 'phone' }, label: 'Pixel' }])[0]?.label).toBe('Pixel');
  });
});

describe('vacuum room source', () => {
  it('waits for the vacuum and asks the hub for its room links', () => {
    expect(remoteNeedOf('vacuum.rooms', context())).toEqual({
      kind: 'blocked',
      reason: 'Pick the vacuum first',
    });
    expect(remoteNeedOf('vacuum.rooms', context({ values: { vacuum: 'robo' } }))).toEqual({
      kind: 'fetch',
      fetch: { t: 'vacuum_rooms', deviceId: 'robo' },
    });
  });

  it('lists linked rooms and shows unlinked or stale ones disabled with the reason', () => {
    const rows = vacuumRoomRows([
      { id: 'hall', name: 'Hall', usedBy: { mapRoomName: 'Corridor', stale: false } },
      { id: 'kitchen', name: 'Kitchen', usedBy: null },
      { id: 'den', name: 'Den', usedBy: { mapRoomName: 'Old', stale: true } },
    ]);
    const result = resolveOptions('vacuum.rooms', context({ values: { vacuum: 'robo' } }), HOME, {
      status: 'ready',
      rows,
    });
    expect(result.status === 'ready' ? result.options : []).toEqual([
      { id: 'hall', label: 'Hall', detail: 'Corridor' },
      {
        id: 'kitchen',
        label: 'Kitchen',
        unavailable: 'Not linked to a room on this vacuum map; link it on the vacuum page',
      },
      {
        id: 'den',
        label: 'Den',
        unavailable: 'Linked to a room that is no longer on this vacuum map',
      },
    ]);
  });
});

describe('every source in the closed list', () => {
  it('resolves without throwing and explains every non-ready answer', () => {
    for (const source of OPTION_SOURCE_IDS) {
      const result = resolveOptions(source, context(), HOME, IDLE);
      expect(['ready', 'loading', 'unavailable']).toContain(result.status);
      if (result.status === 'unavailable') expect(result.reason).not.toBe('');
    }
  });
});

describe('television sources', () => {
  const tv = deviceFixture(7, {
    id: 'tv',
    kind: 'television',
    name: 'Living room TV',
    capabilities: [
      {
        key: 'input_source',
        label: 'Input',
        access: 'read_write',
        value: { kind: 'enum', options: ['hdmi1', 'hdmi2'] },
      },
      {
        key: 'app_launch',
        label: 'App',
        access: 'read_write',
        value: { kind: 'enum', options: ['Netflix'] },
      },
      {
        key: 'remote_key',
        label: 'Key',
        access: 'read_write',
        value: { kind: 'enum', options: ['home', 'back'] },
      },
      {
        key: 'raw:custom.picturemode.picture_mode',
        label: 'Picture',
        access: 'read_write',
        value: { kind: 'enum', options: ['movie', 'game'] },
      },
      {
        key: 'raw:custom.soundmode.sound_mode',
        label: 'Sound',
        access: 'read_write',
        value: { kind: 'enum', options: ['standard'] },
      },
    ],
  });
  const home: HomeData = { ...HOME, devices: [...HOME.devices, tv] };

  it('lists what the picked TV offers', () => {
    const picked = context({ target: ['tv'] });
    expect(ids(resolveOptions('tv.inputs', picked, home, IDLE))).toEqual(['hdmi1', 'hdmi2']);
    expect(ids(resolveOptions('tv.apps', picked, home, IDLE))).toEqual(['Netflix']);
    expect(ids(resolveOptions('tv.keys', picked, home, IDLE))).toEqual(['home', 'back']);
    expect(ids(resolveOptions('tv.picture_modes', picked, home, IDLE))).toEqual(['movie', 'game']);
    expect(ids(resolveOptions('tv.sound_modes', picked, home, IDLE))).toEqual(['standard']);
  });

  it('waits for a TV and says so when the device offers nothing', () => {
    expect(resolveOptions('tv.inputs', context(), home, IDLE)).toEqual({
      status: 'unavailable',
      reason: 'Pick the device, room or group first',
    });
    expect(resolveOptions('tv.inputs', context({ target: ['plug'] }), home, IDLE)).toEqual({
      status: 'unavailable',
      reason: 'The TV offers no inputs',
    });
  });
});
