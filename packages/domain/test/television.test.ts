import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DEVICE_CAPABILITY,
  INPUT_LABELS,
  JSON_VALUE,
  TV_APP_CATALOGUE,
  TV_DIRECT_CODES,
  TV_IR_WORDS,
  TV_KEYS,
  TV_KEY_LABELS,
  TV_KEY_REASONS,
  TV_KEY_REASON_TEXT,
  TV_MODES,
  TV_PATHS,
  TV_ROLES,
  TV_SMARTTHINGS_PAD,
  currentApp,
  deviceFamily,
  inputLabel,
  irButtonFor,
  powerOnPath,
  presentDevice,
  presentValue,
  tvKeyMap,
  tvMode,
  tvState,
  tvValuesOf,
  withRole,
  type JsonValue,
  type TvDevice,
  type TvKey,
  type TvKeyMap,
  type TvMode,
  type TvPaths,
  type TvValues,
} from '../src';

const FIXTURE = z
  .record(
    z.string(),
    z.object({
      model: z.string(),
      capabilities: z.array(DEVICE_CAPABILITY),
      state: z.record(z.string(), JSON_VALUE),
    }),
  )
  .parse(
    JSON.parse(
      readFileSync(new URL('./fixtures/smartthings-televisions.json', import.meta.url), 'utf8'),
    ),
  );

const CLOUD_ONLY: TvPaths = {
  smartthings: true,
  direct: { attached: false },
  wake: false,
  irRemoteId: null,
  irButtons: [],
};

const WITH_DIRECT: TvPaths = { ...CLOUD_ONLY, direct: { attached: true } };

const WITH_WAKE: TvPaths = { ...CLOUD_ONLY, wake: true };

const IR_REMOTE = 'ir-remote-1';

const IR_BUTTONS = ['Power', 'Vol +', 'Vol -', 'Mute', 'Channel Up', '7', 'OK', 'Play Pause'];

const WITH_IR: TvPaths = { ...CLOUD_ONLY, irRemoteId: IR_REMOTE, irButtons: IR_BUTTONS };

const NO_PATH: TvPaths = { ...CLOUD_ONLY, smartthings: false };

type Name = 'livingRoom' | 'bedroom' | 'monitor';

function tv(name: Name, online: boolean): TvDevice {
  const entry = FIXTURE[name];
  if (entry === undefined) throw new Error(`missing ${name}`);
  return {
    id: `${name}-id`,
    kind: 'television',
    model: entry.model,
    online,
    capabilities: entry.capabilities,
  };
}

function valuesOf(name: Name, device: TvDevice, changes: Record<string, JsonValue> = {}): TvValues {
  const state = { ...FIXTURE[name]?.state, ...changes };
  return tvValuesOf(device, (key) => state[key]);
}

function modeOf(
  name: Name,
  online: boolean,
  paths: TvPaths,
  changes: Record<string, JsonValue> = {},
): TvMode {
  const device = tv(name, online);
  return tvMode(device, valuesOf(name, device, changes), paths);
}

const ON = { power: true };

function keysOf(
  name: Name,
  online: boolean,
  paths: TvPaths,
  changes: Record<string, JsonValue> = {},
): TvKeyMap {
  const device = tv(name, online);
  return tvKeyMap(device, valuesOf(name, device, changes), paths);
}

describe('the television key vocabulary', () => {
  it('names every key once and labels each of them', () => {
    expect(new Set(TV_KEYS).size).toBe(TV_KEYS.length);
    expect(Object.keys(TV_KEY_LABELS).sort()).toEqual([...TV_KEYS].sort());
  });

  it('keeps direct codes, the SmartThings pad and IR words inside the vocabulary', () => {
    const known: ReadonlySet<string> = new Set(TV_KEYS);
    for (const table of [TV_DIRECT_CODES, TV_SMARTTHINGS_PAD, TV_IR_WORDS]) {
      expect(Object.keys(table).every((key) => known.has(key))).toBe(true);
    }
    expect(Object.values(TV_DIRECT_CODES).every((code) => code.startsWith('KEY_'))).toBe(true);
  });

  it('words every reason a key can be unavailable', () => {
    expect(Object.keys(TV_KEY_REASON_TEXT).sort()).toEqual([...TV_KEY_REASONS].sort());
    expect(TV_KEY_REASON_TEXT.needs_direct).toBe('Needs a direct connection to the TV');
  });

  it('lists the paths, modes and roles the app and hub share', () => {
    expect(TV_PATHS).toEqual(['smartthings', 'direct', 'ir']);
    expect(TV_MODES).toContain('turning_on');
    expect(TV_ROLES).toContain('current_app');
  });
});

describe('the app a television reports', () => {
  it('names every app seen on the live televisions', () => {
    expect(currentApp('9Ur5IzDKqV.TizenYouTube')).toMatchObject({
      name: 'YouTube',
      monogram: 'YO',
    });
    expect(currentApp('org.tizen.browser')?.name).toBe('Browser');
    expect(currentApp('com.samsung.tv.csfs')?.name).toBe('Home screen');
  });

  it('knows launch ids as well as package ids', () => {
    expect(currentApp('3201907018807')?.name).toBe('Netflix');
    expect(currentApp('org.tizen.ignition')?.name).toBe('Prime Video');
  });

  it('gives every catalogued app the same tone and a monogram of at most two letters', () => {
    for (const entry of TV_APP_CATALOGUE) {
      const ids = [...entry.launchIds, ...entry.packageIds];
      const apps = ids.map((id) => currentApp(id));
      expect(new Set(apps.map((app) => app?.tone)).size).toBe(1);
      expect(apps.every((app) => (app?.monogram.length ?? 0) <= 2)).toBe(true);
    }
    expect(currentApp('3201910019365')?.monogram).toBe('PV');
  });

  it('humanises an unknown package from its last segment', () => {
    expect(currentApp('org.tizen.smarthub-connection-test')).toMatchObject({
      name: 'Smarthub connection test',
      monogram: 'SC',
    });
    expect(currentApp('com.example.TizenFancyPlayer')?.name).toBe('Fancy Player');
    expect(currentApp('x.y.Z')?.name).toBe('Z');
    expect(currentApp('.')?.name).toBe('.');
  });

  it('gives an unknown app the neutral tone', () => {
    expect(currentApp('com.example.one')?.tone).toBe('viz-8');
  });

  it('has no app when nothing is open', () => {
    expect(currentApp('')).toBeNull();
    expect(currentApp('  ')).toBeNull();
    expect(currentApp(null)).toBeNull();
    expect(currentApp(undefined)).toBeNull();
  });
});

describe('input labels', () => {
  it('uses the table, then a humanised id', () => {
    expect(inputLabel('HDMI1')).toBe(INPUT_LABELS['HDMI1']);
    expect(inputLabel('dtv')).toBe('TV');
    expect(inputLabel('componentOne')).toBe('Component one');
  });
});

describe('what the presentation reads from a television', () => {
  const device = tv('livingRoom', false);
  const presentation = presentDevice(device);

  it('keeps the family and finds each role', () => {
    expect(deviceFamily(device)).toBe('television');
    const roles = [
      ['current_app', 'raw:tv_channel.tv_channel_name'],
      ['picture_mode', 'raw:custom.picturemode.picture_mode'],
      ['sound_mode', 'raw:custom.soundmode.sound_mode'],
      ['ambient_mode', 'raw:samsungvd.ambient:set_ambient_on'],
      ['tv_category', 'raw:samsungvd.device_category.category'],
      ['power_on_remote', 'raw:samsungvd.supports_power_on_by_ocf.supports_power_on_by_ocf'],
      ['tv_updating', 'raw:samsungvd.thing_status.status'],
    ] as const;
    for (const [role, key] of roles) {
      expect(withRole(presentation, role)?.key).toBe(key);
    }
  });

  it('shows the app by name and hides the raw setters', () => {
    const app = withRole(presentation, 'current_app');
    if (app === undefined) throw new Error('no app');
    expect(presentValue(app, '9Ur5IzDKqV.TizenYouTube')).toBe('YouTube');
    expect(presentValue(app, 7)).toBe('');
    const hiddenKeys = presentation.capabilities
      .filter((entry) => entry.tier === 'hidden')
      .map((entry) => entry.key);
    expect(hiddenKeys).toEqual(
      expect.arrayContaining([
        'raw:custom.picturemode:set_picture_mode',
        'raw:custom.soundmode:set_sound_mode',
      ]),
    );
  });

  it('labels remote buttons with the vocabulary', () => {
    const remote = presentDevice({
      kind: 'television',
      model: 'x',
      capabilities: [
        DEVICE_CAPABILITY.parse({
          key: 'remote_key',
          label: 'Remote button',
          access: 'write',
          value: { kind: 'enum', options: ['vol_up', 'ok'] },
        }),
      ],
    });
    expect(remote.capabilities[0]?.options).toEqual([
      { value: 'vol_up', label: 'Volume up' },
      { value: 'ok', label: 'Select' },
    ]);
  });
});

describe('reading a television by role', () => {
  it('reads the live values of the living room television', () => {
    const device = tv('livingRoom', false);
    expect(valuesOf('livingRoom', device)).toEqual({
      power: false,
      volume: 17,
      muted: false,
      input: 'dtv',
      channel: null,
      playback: null,
      app: '9Ur5IzDKqV.TizenYouTube',
      category: 'tv',
      powerOnRemote: false,
      updating: false,
    });
  });

  it('reads the monitor category, the remote power flag and an update', () => {
    const monitor = tv('monitor', false);
    expect(valuesOf('monitor', monitor)).toMatchObject({
      category: 'monitor',
      powerOnRemote: true,
    });
    const updating = valuesOf('monitor', monitor, {
      'raw:samsungvd.thing_status.status': 'AgentUpdate Started',
      'raw:samsungvd.supports_power_on_by_ocf.supports_power_on_by_ocf': true,
      channel: 12,
      playback: 'playing',
    });
    expect(updating).toMatchObject({
      updating: true,
      powerOnRemote: true,
      channel: 12,
      playback: 'playing',
    });
  });

  it('reads nothing from a device without the roles', () => {
    const bare = {
      id: 'bare',
      kind: 'television',
      model: 'm',
      online: true,
      capabilities: [],
    } as const;
    expect(tvValuesOf(bare, () => 1)).toEqual({
      power: null,
      volume: null,
      muted: null,
      input: null,
      channel: null,
      playback: null,
      app: null,
      category: 'tv',
      powerOnRemote: false,
      updating: false,
    });
  });
});

describe('the mode of a television', () => {
  it('reads a sleeping television with a wake path as standby, not as lost', () => {
    expect(modeOf('bedroom', false, WITH_WAKE)).toBe('standby');
    expect(modeOf('monitor', false, WITH_WAKE)).toBe('standby');
    expect(modeOf('livingRoom', false, WITH_WAKE)).toBe('standby');
    expect(modeOf('bedroom', true, CLOUD_ONLY, { power: false })).toBe('standby');
  });

  it('does not count on SmartThings to wake a television it cannot reach', () => {
    expect(modeOf('bedroom', false, CLOUD_ONLY)).toBe('off_unreachable');
    expect(modeOf('monitor', false, CLOUD_ONLY)).toBe('unreachable');
  });

  it('reads the living room television as off and unable to wake until a path exists', () => {
    expect(modeOf('livingRoom', false, CLOUD_ONLY)).toBe('off_unreachable');
    expect(modeOf('livingRoom', false, WITH_DIRECT)).toBe('standby');
    expect(modeOf('livingRoom', false, WITH_IR)).toBe('standby');
    expect(modeOf('livingRoom', false, { ...WITH_IR, irButtons: ['Mute'] })).toBe(
      'off_unreachable',
    );
  });

  it('reads a television that was last on and cannot be woken as not responding', () => {
    expect(modeOf('livingRoom', false, CLOUD_ONLY, ON)).toBe('unreachable');
  });

  it('reads an online television as on, unless it says it is off', () => {
    expect(modeOf('livingRoom', true, CLOUD_ONLY, ON)).toBe('on');
    expect(modeOf('livingRoom', true, CLOUD_ONLY, { power: false })).toBe('off_unreachable');
    expect(modeOf('livingRoom', true, CLOUD_ONLY, { power: null })).toBe('on');
  });

  it('puts an update before everything else', () => {
    const changes = { 'raw:samsungvd.thing_status.status': 'AgentUpdate Started', ...ON };
    expect(modeOf('livingRoom', true, CLOUD_ONLY, changes)).toBe('updating');
    expect(modeOf('bedroom', false, CLOUD_ONLY, changes)).toBe('updating');
  });
});

describe('the keys of a television', () => {
  it('sends the pad through SmartThings when only the cloud is linked', () => {
    const keys = keysOf('livingRoom', true, CLOUD_ONLY, ON);
    expect(keys('up')).toEqual({
      path: 'smartthings',
      send: { deviceId: 'livingRoom-id', capability: 'remote_key', value: 'up' },
      fallbacks: [],
    });
    expect(keys('vol_up')).toMatchObject({
      path: 'smartthings',
      send: { capability: 'raw:audio_volume:volume_up', value: null },
    });
    expect(keys('ch_down')).toMatchObject({ send: { capability: 'raw:tv_channel:channel_down' } });
    expect(keys('next_track')).toMatchObject({
      send: { capability: 'raw:media_track_control:next_track' },
    });
  });

  it('toggles mute from the last known state', () => {
    expect(keysOf('livingRoom', true, CLOUD_ONLY, ON)('mute')).toMatchObject({
      send: { capability: 'mute', value: true },
    });
    expect(keysOf('livingRoom', true, CLOUD_ONLY, { ...ON, mute: true })('mute')).toMatchObject({
      send: { capability: 'mute', value: false },
    });
  });

  it('maps the transport keys onto playback', () => {
    const keys = keysOf('livingRoom', true, CLOUD_ONLY, ON);
    expect(keys('pause')).toMatchObject({ send: { capability: 'playback', value: 'paused' } });
    expect(keys('ff')).toMatchObject({ send: { value: 'fast forwarding' } });
    expect(keys('play_pause')).toMatchObject({ send: { value: 'playing' } });
    const playing = keysOf('livingRoom', true, CLOUD_ONLY, { ...ON, playback: 'playing' });
    expect(playing('play_pause')).toMatchObject({ send: { value: 'paused' } });
  });

  it('asks for a direct connection for the keys SmartThings cannot send', () => {
    const keys = keysOf('livingRoom', true, CLOUD_ONLY, ON);
    for (const key of ['n3', 'source', 'guide', 'red', 'settings', 'record'] as const) {
      expect(keys(key)).toEqual({ path: null, reason: 'needs_direct' });
    }
  });

  it('prefers the direct link for keys and keeps SmartThings as the fallback', () => {
    const keys = keysOf('livingRoom', true, WITH_DIRECT, ON);
    expect(keys('vol_up')).toEqual({
      path: 'direct',
      send: { deviceId: 'livingRoom-id', capability: 'remote_key', value: 'vol_up' },
      fallbacks: [
        {
          path: 'smartthings',
          send: {
            deviceId: 'livingRoom-id',
            capability: 'raw:audio_volume:volume_up',
            value: null,
          },
        },
      ],
    });
    expect(keys('n3')).toMatchObject({ path: 'direct', fallbacks: [] });
    expect(keys('next_track')).toMatchObject({ path: 'smartthings' });
    expect(keys('play_pause')).toMatchObject({
      path: 'direct',
      send: { capability: 'remote_key', value: 'play' },
    });
    const playing = keysOf('livingRoom', true, WITH_DIRECT, { ...ON, playback: 'playing' });
    expect(playing('play_pause')).toMatchObject({ send: { value: 'pause' } });
  });

  it('presses the learned infrared button as the last resort', () => {
    const keys = keysOf('livingRoom', true, WITH_IR, ON);
    expect(keys('n7')).toEqual({
      path: 'ir',
      send: { deviceId: IR_REMOTE, capability: 'remote_key', value: '7' },
      fallbacks: [],
    });
    expect(keys('vol_up')).toMatchObject({
      path: 'smartthings',
      fallbacks: [{ path: 'ir', send: { value: 'Vol +' } }],
    });
    expect(keys('red')).toEqual({ path: null, reason: 'needs_direct' });
    expect(keys('play_pause')).toMatchObject({ path: 'smartthings' });
  });

  it('chooses the power path by what can wake the television', () => {
    const cloud = keysOf('bedroom', true, CLOUD_ONLY, { power: false });
    expect(cloud('power_on')).toMatchObject({ path: 'smartthings', send: { value: true } });
    expect(cloud('power')).toMatchObject({ path: 'smartthings', send: { value: true } });
    expect(keysOf('bedroom', false, CLOUD_ONLY)('power_on')).toEqual({
      path: null,
      reason: 'cannot_wake',
    });
    expect(keysOf('livingRoom', false, WITH_WAKE)('power_on')).toMatchObject({
      path: 'smartthings',
      send: { capability: 'power', value: true },
    });
    expect(keysOf('livingRoom', false, CLOUD_ONLY)('power_on')).toEqual({
      path: null,
      reason: 'cannot_wake',
    });
    expect(keysOf('livingRoom', false, CLOUD_ONLY)('power')).toEqual({
      path: null,
      reason: 'cannot_wake',
    });
    const direct = keysOf('livingRoom', false, WITH_DIRECT);
    expect(direct('power_on')).toMatchObject({ path: 'direct', send: { value: true } });
    expect(keysOf('livingRoom', false, WITH_IR)('power_on')).toEqual({
      path: 'ir',
      send: { deviceId: IR_REMOTE, capability: 'remote_key', value: 'Power' },
      fallbacks: [],
    });
  });

  it('wakes a linked screen through the direct link first, even when SmartThings could wake it', () => {
    const both = keysOf('bedroom', true, { ...WITH_DIRECT, wake: true }, { power: false });
    expect(both('power_on')).toMatchObject({
      path: 'direct',
      send: { capability: 'power', value: true },
      fallbacks: [{ path: 'smartthings', send: { capability: 'power', value: true } }],
    });
    const device = tv('bedroom', true);
    const values = valuesOf('bedroom', device, { power: false });
    expect(powerOnPath(values, { ...WITH_DIRECT, wake: true }, true)).toBe('direct');
  });

  it('turns an awake television off through the direct link first', () => {
    const keys = keysOf('bedroom', true, WITH_DIRECT, ON);
    expect(keys('power_off')).toMatchObject({
      path: 'direct',
      send: { capability: 'power', value: false },
      fallbacks: [{ path: 'smartthings', send: { capability: 'power', value: false } }],
    });
    expect(keys('power')).toMatchObject({ send: { value: false } });
    expect(keysOf('bedroom', true, CLOUD_ONLY, ON)('power_off')).toMatchObject({
      path: 'smartthings',
    });
  });

  it('refuses to power off with no way to reach the television', () => {
    expect(keysOf('bedroom', true, NO_PATH, ON)('power_off')).toEqual({
      path: null,
      reason: 'unreachable',
    });
  });

  it('explains every key while the television is off, updating or silent', () => {
    expect(keysOf('bedroom', false, CLOUD_ONLY)('vol_up')).toEqual({
      path: null,
      reason: 'tv_off',
    });
    expect(keysOf('livingRoom', false, CLOUD_ONLY, ON)('vol_up')).toEqual({
      path: null,
      reason: 'unreachable',
    });
    const updating = keysOf('bedroom', true, CLOUD_ONLY, {
      ...ON,
      'raw:samsungvd.thing_status.status': 'AgentUpdate Started',
    });
    expect(updating('vol_up')).toEqual({ path: null, reason: 'updating' });
    expect(updating('power_off')).toEqual({ path: null, reason: 'updating' });
  });

  it('leaves out the channel keys on a monitor', () => {
    const keys = keysOf('monitor', true, WITH_DIRECT, ON);
    for (const key of ['ch_up', 'n4', 'guide', 'red', 'channel_list'] as const) {
      expect(keys(key)).toEqual({ path: null, reason: 'not_on_this_tv' });
    }
    expect(keys('vol_up')).toMatchObject({ path: 'direct' });
  });

  it('is empty of paths when the device lacks the SmartThings capabilities', () => {
    const device: TvDevice = {
      id: 'bare',
      kind: 'television',
      model: 'm',
      online: true,
      capabilities: [],
    };
    const values = tvValuesOf(device, () => undefined);
    const keys = tvKeyMap(device, values, CLOUD_ONLY);
    for (const key of ['up', 'vol_up', 'mute', 'play', 'power_off'] as const) {
      expect(keys(key).path).toBeNull();
    }
  });
});

describe('infrared button names', () => {
  it('matches buttons by the words people give them', () => {
    expect(irButtonFor('vol_up', ['Volume +'])).toBe('Volume +');
    expect(irButtonFor('ok', ['Left', 'Select'])).toBe('Select');
    expect(irButtonFor('n0', ['zero'])).toBe('zero');
    expect(irButtonFor('ff', ['Fast-Forward'])).toBe('Fast-Forward');
    expect(irButtonFor('mute', ['Vol +'])).toBeNull();
    expect(irButtonFor('power_on', ['Power'])).toBe('Power');
  });

  it('knows no buttons for a key it has no words for', () => {
    expect(irButtonFor('prev_track', ['Previous'])).toBeNull();
  });
});

describe('the state of a television', () => {
  const key = (value: TvKey): TvKey => value;

  it('says what an app is playing and how loud', () => {
    const device = tv('livingRoom', true);
    const state = tvState(valuesOf('livingRoom', device, ON), device, CLOUD_ONLY);
    expect(state).toMatchObject({
      mode: 'on',
      category: 'tv',
      watching: { kind: 'app', label: 'YouTube' },
      volume: { level: 17, muted: false, stale: false },
    });
    expect(state.keys(key('vol_up')).path).toBe('smartthings');
  });

  it('falls back to the channel on the tuner and the input otherwise', () => {
    const device = tv('livingRoom', true);
    const tuner = valuesOf('livingRoom', device, {
      ...ON,
      'raw:tv_channel.tv_channel_name': '',
      channel: 7,
    });
    expect(tvState(tuner, device, CLOUD_ONLY).watching).toEqual({
      kind: 'channel',
      label: 'Channel 7',
    });
    const hdmi = valuesOf('livingRoom', device, {
      ...ON,
      'raw:tv_channel.tv_channel_name': '',
      input_source: 'HDMI1',
      channel: 7,
    });
    expect(tvState(hdmi, device, CLOUD_ONLY).watching).toEqual({ kind: 'input', label: 'HDMI 1' });
    const tunerNoChannel = valuesOf('livingRoom', device, {
      ...ON,
      'raw:tv_channel.tv_channel_name': '',
    });
    expect(tvState(tunerNoChannel, device, CLOUD_ONLY).watching).toEqual({
      kind: 'input',
      label: 'TV',
    });
  });

  it('watches nothing while off or without an input', () => {
    const device = tv('bedroom', false);
    expect(tvState(valuesOf('bedroom', device), device, CLOUD_ONLY).watching).toEqual({
      kind: 'none',
      label: '',
    });
    const online = tv('bedroom', true);
    const values = valuesOf('bedroom', online, {
      ...ON,
      'raw:tv_channel.tv_channel_name': '',
      input_source: '',
    });
    expect(tvState(values, online, CLOUD_ONLY).watching).toEqual({ kind: 'none', label: '' });
  });

  it('marks a volume older than the last power on as stale and reports mute', () => {
    const device = tv('livingRoom', true);
    const values = valuesOf('livingRoom', device, { ...ON, mute: true });
    const stale = tvState(values, device, CLOUD_ONLY, {
      volumeObservedAt: '2026-10-17T10:00:00.000Z',
      poweredOnAt: '2026-10-17T15:56:00.000Z',
    });
    expect(stale.volume).toEqual({ level: 17, muted: true, stale: true });
    const fresh = tvState(values, device, CLOUD_ONLY, {
      volumeObservedAt: '2026-10-17T16:00:00.000Z',
      poweredOnAt: '2026-10-17T15:56:00.000Z',
    });
    expect(fresh.volume.stale).toBe(false);
    expect(
      tvState(values, device, CLOUD_ONLY, { poweredOnAt: '2026-10-17T15:56:00.000Z' }).volume.stale,
    ).toBe(false);
  });

  it('unites the offered inputs, the current one and the ones seen before', () => {
    const device = tv('livingRoom', true);
    const values = valuesOf('livingRoom', device, ON);
    const state = tvState(values, device, CLOUD_ONLY, {
      inputsSeen: ['HDMI1', 'dtv', 'HDMI2'],
      inputNames: { HDMI1: 'PlayStation' },
    });
    expect(state.inputs).toEqual([
      { id: 'dtv', label: 'TV', name: null },
      { id: 'HDMI1', label: 'PlayStation', name: 'PlayStation' },
      { id: 'HDMI2', label: 'HDMI 2', name: null },
    ]);
    const withoutInput = valuesOf('livingRoom', device, { ...ON, input_source: '' });
    expect(tvState(withoutInput, device, CLOUD_ONLY).inputs.map((input) => input.id)).toEqual([
      'dtv',
    ]);
  });

  it('names what is watched with the name given to the input', () => {
    const device = tv('livingRoom', true);
    const values = valuesOf('livingRoom', device, {
      ...ON,
      input_source: 'HDMI1',
      'raw:tv_channel.tv_channel_name': '',
    });
    expect(tvState(values, device, CLOUD_ONLY).watching).toEqual({
      kind: 'input',
      label: 'HDMI 1',
    });
    expect(
      tvState(values, device, CLOUD_ONLY, { inputNames: { HDMI1: 'PlayStation' } }).watching,
    ).toEqual({ kind: 'input', label: 'PlayStation' });
  });

  it('shows turning on only for a standby television and keeps the stronger modes', () => {
    const standby = tv('bedroom', false);
    const values = valuesOf('bedroom', standby);
    expect(tvState(values, standby, WITH_WAKE, { turningOn: true }).mode).toBe('turning_on');
    expect(tvState(values, standby, WITH_WAKE, { turningOn: false }).mode).toBe('standby');
    const lost = tv('livingRoom', false);
    const lostValues = valuesOf('livingRoom', lost, ON);
    expect(tvState(lostValues, lost, CLOUD_ONLY, { turningOn: true }).mode).toBe('unreachable');
    const awake = tv('bedroom', true);
    expect(
      tvState(valuesOf('bedroom', awake, ON), awake, CLOUD_ONLY, { turningOn: true }).mode,
    ).toBe('on');
  });
});
