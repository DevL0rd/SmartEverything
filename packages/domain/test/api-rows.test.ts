import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  AUTOMATION_ROW,
  CAMERA_ROW,
  CLIENT_ROW,
  COMMAND_ROW,
  COMMAND_SOURCES,
  DEVICE_ROW,
  EVENT_ROW,
  HEALTH_DAILY_ROW,
  HEALTH_METRICS,
  HEALTH_METRIC_UNITS,
  HEALTH_SOURCE_ROW,
  HISTORY_ROW,
  IR_CODE_FORMATS,
  IR_CODE_ROW,
  IR_REMOTE_ROW,
  LAYOUT_ROW,
  MCP_TOKEN_ROW,
  OAUTH_CLIENT_ROW,
  PROVIDER_LINK_ROW,
  PROVIDER_STATUSES,
  PUSH_TARGET_ROW,
  RECORDING_KINDS,
  RECORDING_ROW,
  ROOM_ROW,
  SCENE_ROW,
  SETTINGS_ROW,
  STATE_ROW,
  HUB_STATUS,
  LIVE_CLIENT_MESSAGE,
  LIVE_SERVER_MESSAGE,
  LIVE_TABLES,
  OWNER_TABLES,
  OWN_ROW_TABLES,
  ROW_CHANGE,
  ROW_OPERATIONS,
  TABLE_ROWS,
} from '../src';
import { HEALTH_SOURCE_NAME, TOKEN_NAME } from '../src/api/rows-access';
import {
  CLIENT_NAME,
  COMMAND_SOURCE,
  DEVICE_NAME,
  HOME_NAME,
  LATITUDE,
  LONGITUDE,
  ROOM_NAME,
} from '../src/api/rows-home';
import {
  AUTOMATION_NAME,
  BUTTON_NAME,
  IR_CODE_FORMAT,
  LAYOUT_PAGE_NAME,
  PUSH_PLATFORMS,
  PUSH_TOKEN,
  RECORDING_KIND,
  REMOTE_NAME,
  SCENE_NAME,
} from '../src/api/rows-media';

const FIRST = '00000000-0000-4000-8000-000000000001';
const SECOND = '00000000-0000-4000-8000-000000000002';
const THIRD = '00000000-0000-4000-8000-000000000003';
const AT = '2026-10-08T07:00:00Z';
const LATER = '2026-10-08T08:00:00+01:00';

function accepts(schema: z.ZodType, value: unknown): boolean {
  return schema.safeParse(value).success;
}

function expectRoundTrip(schema: z.ZodType, row: Readonly<Record<string, unknown>>): void {
  expect(schema.parse(row)).toStrictEqual(row);
  expect(accepts(schema, { ...row, unexpected: 1 })).toBe(false);
}

function expectRefused(
  schema: z.ZodType,
  row: Readonly<Record<string, unknown>>,
  changes: readonly Readonly<Record<string, unknown>>[],
): void {
  for (const change of changes) {
    expect(accepts(schema, { ...row, ...change })).toBe(false);
  }
}

const settings = {
  home_name: 'Our Home',
  time_zone: 'Europe/London',
  latitude: 51.5,
  longitude: -0.12,
  public_url: 'https://home.example.com',
  public_url_checked_at: AT,
  public_url_verified_at: LATER,
  public_url_error: 'timed out',
  ice_servers: [{ urls: ['stun:stun.example.com:3478'] }],
  webrtc_candidates: ['192.168.1.2:8555'],
  push_project_id: 'home-push',
  updated_at: AT,
};

const client = {
  id: FIRST,
  name: 'Pixel 9',
  platform: 'android',
  role: 'member',
  built_in: false,
  created_at: AT,
  last_seen_at: LATER,
};

const providerLink = {
  provider: 'xiaomi',
  account_label: 'me@example.com',
  status: 'needs_attention',
  prompt: { kind: 'verification_code', destination: '+44 7700 900000' },
  last_error: 'code expired',
  device_count: 3,
  updated_at: AT,
};

const room = { id: FIRST, name: 'Kitchen', position: 2 };

const device = {
  id: FIRST,
  provider: 'tuya',
  external_id: 'bf12',
  parent_id: SECOND,
  kind: 'light',
  name: 'Ceiling light',
  display_name: 'Big light',
  model: 'TL-1',
  manufacturer: 'Tuya',
  provider_room: 'Lounge',
  room_id: THIRD,
  online: true,
  capabilities: [
    { key: 'power', label: 'Power', access: 'read_write', value: { kind: 'boolean' } },
  ],
  details: { firmware: '1.2' },
  hidden: false,
  favourite: true,
  position: 4,
  created_at: AT,
  updated_at: LATER,
};

const state = { device_id: FIRST, capability: 'power', value: true, observed_at: AT };

const history = { ...state, id: 7 };

const command = {
  id: FIRST,
  device_id: SECOND,
  capability: 'power',
  value: true,
  status: 'succeeded',
  source: 'assistant',
  result: { ok: true },
  error: 'none',
  requested_by: THIRD,
  created_at: AT,
  started_at: AT,
  finished_at: LATER,
  expires_at: LATER,
};

const event = {
  id: FIRST,
  device_id: SECOND,
  kind: 'motion',
  occurred_at: AT,
  details: { zone: 'porch' },
  acknowledged_at: LATER,
  created_at: AT,
};

const camera = {
  device_id: FIRST,
  stream_name: 'porch',
  source_url_kind: 'rtsp',
  physical_ptz: true,
  two_way_audio: false,
  record_events: true,
};

const recording = {
  id: FIRST,
  device_id: SECOND,
  event_id: THIRD,
  kind: 'clip',
  storage_path: 'clips/a.mp4',
  started_at: AT,
  duration_ms: 12_000,
  bytes: 1024,
  created_at: AT,
};

const irRemote = {
  id: FIRST,
  blaster_id: SECOND,
  name: 'TV remote',
  category: 'tv',
  brand: 'Sony',
  created_at: AT,
};

const irCode = {
  id: FIRST,
  remote_id: SECOND,
  button: 'Power',
  format: 'pulses',
  code: '9000,4500',
  created_at: AT,
};

const scene = {
  id: FIRST,
  name: 'Movie night',
  icon: 'film',
  actions: [{ type: 'command', deviceId: SECOND, capability: 'power', value: false }],
  position: 1,
  created_at: AT,
};

const automation = {
  id: FIRST,
  name: 'Porch light',
  enabled: true,
  definition: { triggers: [] },
  last_run_at: AT,
  last_error: 'device offline',
  run_count: 5,
  created_at: AT,
  updated_at: LATER,
};

const layout = { client_id: FIRST, page: 'home', layout: { tiles: ['a', 'b'] }, updated_at: AT };

const pushTarget = { token: 'fcm-token', client_id: FIRST, platform: 'android', created_at: AT };

const healthDaily = {
  day: '2026-10-08',
  metric: 'steps',
  value: 1234,
  unit: 'count',
  updated_at: AT,
};

const healthSource = {
  id: FIRST,
  client_id: SECOND,
  name: 'Pixel 9',
  granted_types: ['Steps', 'HeartRate'],
  last_sync_at: AT,
  last_error: 'quota',
  created_at: AT,
  revoked_at: LATER,
};

const mcpToken = {
  id: FIRST,
  name: 'Laptop',
  created_at: AT,
  last_used_at: LATER,
  revoked_at: LATER,
};

const oauthClient = {
  id: 'claude',
  name: 'Claude',
  uri: 'https://claude.ai',
  logo_uri: 'https://claude.ai/logo.png',
  redirect_uris: ['https://claude.ai/callback', 'https://claude.ai/other'],
  scopes: ['mcp', 'read'],
  created_at: AT,
  granted_at: AT,
  revoked_at: LATER,
};

describe('home rows', () => {
  it('SETTINGS_ROW keeps every setting and allows unset location, URL and push project', () => {
    expectRoundTrip(SETTINGS_ROW, settings);
    expectRoundTrip(SETTINGS_ROW, {
      ...settings,
      latitude: null,
      longitude: null,
      public_url: null,
      public_url_checked_at: null,
      public_url_verified_at: null,
      public_url_error: null,
      ice_servers: [],
      webrtc_candidates: [],
      push_project_id: null,
    });
  });

  it('SETTINGS_ROW refuses invalid settings', () => {
    expectRefused(SETTINGS_ROW, settings, [
      { home_name: '' },
      { time_zone: '' },
      { public_url: 'http://home.example.com' },
      { ice_servers: [{ urls: ['http://a'] }] },
      { webrtc_candidates: ['a b'] },
      { push_project_id: '' },
      { updated_at: null },
    ]);
  });

  it('LATITUDE and LONGITUDE accept the globe and nothing beyond it', () => {
    expect([-90, 0, 51.5, 90].map((value) => LATITUDE.parse(value))).toStrictEqual([
      -90, 0, 51.5, 90,
    ]);
    expect([-180, 0, -0.12, 180].map((value) => LONGITUDE.parse(value))).toStrictEqual([
      -180, 0, -0.12, 180,
    ]);
    expect(accepts(LATITUDE, -90.1)).toBe(false);
    expect(accepts(LATITUDE, 90.1)).toBe(false);
    expect(accepts(LONGITUDE, -180.1)).toBe(false);
    expect(accepts(LONGITUDE, 180.1)).toBe(false);
  });

  it('CLIENT_ROW keeps a client and refuses unknown platforms and roles', () => {
    expectRoundTrip(CLIENT_ROW, client);
    expectRoundTrip(CLIENT_ROW, { ...client, platform: 'desktop', role: 'owner', built_in: true });
    expectRoundTrip(CLIENT_ROW, { ...client, last_seen_at: null });
    expectRefused(CLIENT_ROW, client, [{ platform: 'ios' }, { role: 'admin' }, { name: ' ' }]);
  });

  it('PROVIDER_LINK_ROW keeps a link and lists every link status', () => {
    expect(PROVIDER_STATUSES).toStrictEqual(['linking', 'linked', 'needs_attention', 'unlinked']);
    for (const status of PROVIDER_STATUSES) {
      expectRoundTrip(PROVIDER_LINK_ROW, { ...providerLink, status });
    }
    expectRoundTrip(PROVIDER_LINK_ROW, {
      ...providerLink,
      account_label: null,
      prompt: null,
      last_error: null,
    });
    expectRefused(PROVIDER_LINK_ROW, providerLink, [
      { status: 'broken' },
      { provider: 'hue' },
      { device_count: -1 },
      { prompt: { kind: 'telepathy' } },
    ]);
  });

  it('ROOM_ROW keeps a room and refuses a negative position', () => {
    expectRoundTrip(ROOM_ROW, room);
    expectRefused(ROOM_ROW, room, [{ position: -1 }, { name: '' }, { id: 'kitchen' }]);
  });

  it('DEVICE_ROW keeps a device and allows unplaced, unnamed top-level devices', () => {
    expectRoundTrip(DEVICE_ROW, device);
    expectRoundTrip(DEVICE_ROW, {
      ...device,
      parent_id: null,
      display_name: null,
      provider_room: null,
      room_id: null,
      capabilities: [],
    });
    expectRefused(DEVICE_ROW, device, [
      { external_id: '' },
      { kind: 'robot' },
      { model: '' },
      { manufacturer: '' },
      { display_name: '' },
      {
        capabilities: [{ key: 'nonsense', label: 'X', access: 'read', value: { kind: 'boolean' } }],
      },
    ]);
  });

  it('STATE_ROW and HISTORY_ROW keep a value and refuse an empty capability', () => {
    expectRoundTrip(STATE_ROW, state);
    expectRoundTrip(HISTORY_ROW, history);
    expectRoundTrip(HISTORY_ROW, { ...history, id: 1 });
    expectRefused(STATE_ROW, state, [{ capability: '' }]);
    expectRefused(HISTORY_ROW, history, [{ id: 0 }, { id: 1.5 }]);
  });

  it('COMMAND_ROW keeps a command from every source', () => {
    expect(COMMAND_SOURCES).toStrictEqual(['app', 'automation', 'scene', 'assistant']);
    for (const source of COMMAND_SOURCES) {
      expect(COMMAND_SOURCE.parse(source)).toBe(source);
      expectRoundTrip(COMMAND_ROW, { ...command, source });
    }
    expectRoundTrip(COMMAND_ROW, {
      ...command,
      device_id: null,
      error: null,
      requested_by: null,
      started_at: null,
      finished_at: null,
    });
    expectRefused(COMMAND_ROW, command, [
      { source: 'cron' },
      { status: 'lost' },
      { capability: '' },
    ]);
  });

  it('EVENT_ROW keeps an event and allows a hub event that nobody acknowledged', () => {
    expectRoundTrip(EVENT_ROW, event);
    expectRoundTrip(EVENT_ROW, { ...event, device_id: null, acknowledged_at: null });
    expectRefused(EVENT_ROW, event, [{ kind: 'earthquake' }, { details: [] }]);
  });
});

describe('media rows', () => {
  it('CAMERA_ROW keeps a camera and refuses empty stream details', () => {
    expectRoundTrip(CAMERA_ROW, camera);
    expectRefused(CAMERA_ROW, camera, [{ stream_name: '' }, { source_url_kind: '' }]);
  });

  it('RECORDING_ROW keeps snapshots and clips', () => {
    expect(RECORDING_KINDS).toStrictEqual(['snapshot', 'clip']);
    for (const kind of RECORDING_KINDS) {
      expect(RECORDING_KIND.parse(kind)).toBe(kind);
    }
    expectRoundTrip(RECORDING_ROW, recording);
    expectRoundTrip(RECORDING_ROW, {
      ...recording,
      kind: 'snapshot',
      event_id: null,
      duration_ms: null,
    });
    expectRefused(RECORDING_ROW, recording, [
      { kind: 'gif' },
      { storage_path: '' },
      { bytes: -1 },
      { duration_ms: -1 },
    ]);
  });

  it('IR_REMOTE_ROW and IR_CODE_ROW keep remotes and codes of every format', () => {
    expect(IR_CODE_FORMATS).toStrictEqual(['pulses', 'head_key', 'library']);
    expectRoundTrip(IR_REMOTE_ROW, irRemote);
    expectRoundTrip(IR_REMOTE_ROW, { ...irRemote, brand: null });
    expectRefused(IR_REMOTE_ROW, irRemote, [{ category: '' }, { brand: '' }]);
    for (const format of IR_CODE_FORMATS) {
      expect(IR_CODE_FORMAT.parse(format)).toBe(format);
      expectRoundTrip(IR_CODE_ROW, { ...irCode, format });
    }
    expectRefused(IR_CODE_ROW, irCode, [{ format: 'hex' }, { code: '' }]);
  });

  it('SCENE_ROW and AUTOMATION_ROW keep their stored definitions', () => {
    expectRoundTrip(SCENE_ROW, scene);
    expectRefused(SCENE_ROW, scene, [{ icon: '' }, { actions: {} }]);
    expectRoundTrip(AUTOMATION_ROW, automation);
    expectRoundTrip(AUTOMATION_ROW, { ...automation, last_run_at: null, last_error: null });
    expectRefused(AUTOMATION_ROW, automation, [{ definition: [] }, { run_count: -1 }]);
  });

  it('LAYOUT_ROW keeps a layout of a page', () => {
    expectRoundTrip(LAYOUT_ROW, layout);
    expectRefused(LAYOUT_ROW, layout, [{ page: 'Home' }, { layout: [] }]);
  });

  it('LAYOUT_PAGE_NAME accepts lower-case names of up to 40 characters', () => {
    for (const page of ['a', '9', 'home', 'camera-wall', 'device_pages', `a${'b'.repeat(39)}`]) {
      expect(LAYOUT_PAGE_NAME.parse(page)).toBe(page);
    }
    for (const page of ['', 'Home', '-a', '_a', 'a b', 'Xa', 'a!', `a${'b'.repeat(40)}`]) {
      expect(accepts(LAYOUT_PAGE_NAME, page)).toBe(false);
    }
  });

  it('PUSH_TARGET_ROW keeps an Android token of up to 4096 characters', () => {
    expect(PUSH_PLATFORMS).toStrictEqual(['android']);
    expectRoundTrip(PUSH_TARGET_ROW, pushTarget);
    expect(PUSH_TOKEN.parse('ab')).toBe('ab');
    expect(PUSH_TOKEN.parse('t'.repeat(4096))).toBe('t'.repeat(4096));
    expect(accepts(PUSH_TOKEN, '')).toBe(false);
    expect(accepts(PUSH_TOKEN, 't'.repeat(4097))).toBe(false);
    expectRefused(PUSH_TARGET_ROW, pushTarget, [{ platform: 'ios' }]);
  });
});

describe('health and assistant rows', () => {
  it('HEALTH_METRIC_UNITS gives the unit of every daily metric', () => {
    expect(Object.entries(HEALTH_METRIC_UNITS)).toStrictEqual([
      ['steps', 'count'],
      ['distance', 'm'],
      ['active_energy', 'kcal'],
      ['total_energy', 'kcal'],
      ['floors', 'count'],
      ['hydration', 'l'],
      ['sleep', 'min'],
      ['exercise', 'min'],
      ['heart_rate_average', 'bpm'],
      ['heart_rate_minimum', 'bpm'],
      ['heart_rate_maximum', 'bpm'],
      ['resting_heart_rate', 'bpm'],
      ['heart_rate_variability', 'ms'],
      ['oxygen_saturation', '%'],
      ['respiratory_rate', 'rpm'],
      ['weight', 'kg'],
      ['vo2_max', 'ml/kg/min'],
    ]);
    expect(HEALTH_METRICS).toStrictEqual(Object.keys(HEALTH_METRIC_UNITS));
  });

  it('HEALTH_DAILY_ROW keeps a figure of every metric', () => {
    for (const metric of HEALTH_METRICS) {
      expectRoundTrip(HEALTH_DAILY_ROW, {
        ...healthDaily,
        metric,
        unit: HEALTH_METRIC_UNITS[metric],
      });
    }
    expectRefused(HEALTH_DAILY_ROW, healthDaily, [
      { metric: 'mood' },
      { unit: '' },
      { day: AT },
      { value: '1' },
    ]);
  });

  it('HEALTH_SOURCE_ROW keeps a source and allows one never synced or revoked', () => {
    expectRoundTrip(HEALTH_SOURCE_ROW, healthSource);
    expectRoundTrip(HEALTH_SOURCE_ROW, {
      ...healthSource,
      client_id: null,
      granted_types: [],
      last_sync_at: null,
      last_error: null,
      revoked_at: null,
    });
    expectRefused(HEALTH_SOURCE_ROW, healthSource, [{ granted_types: ['Mood'] }, { name: '' }]);
  });

  it('MCP_TOKEN_ROW keeps a token row and allows one never used or revoked', () => {
    expectRoundTrip(MCP_TOKEN_ROW, mcpToken);
    expectRoundTrip(MCP_TOKEN_ROW, { ...mcpToken, last_used_at: null, revoked_at: null });
    expectRefused(MCP_TOKEN_ROW, mcpToken, [{ name: '' }]);
  });

  it('OAUTH_CLIENT_ROW keeps a client and allows missing links and grants', () => {
    expectRoundTrip(OAUTH_CLIENT_ROW, oauthClient);
    expectRoundTrip(OAUTH_CLIENT_ROW, {
      ...oauthClient,
      id: 'c'.repeat(200),
      name: 'n'.repeat(200),
      uri: null,
      logo_uri: null,
      redirect_uris: ['https://claude.ai/callback'],
      scopes: [],
      granted_at: null,
      revoked_at: null,
    });
    expectRefused(OAUTH_CLIENT_ROW, oauthClient, [
      { id: '' },
      { id: 'c'.repeat(201) },
      { name: '' },
      { name: 'n'.repeat(201) },
      { uri: 'nowhere' },
      { logo_uri: 'nowhere' },
      { redirect_uris: [] },
      { redirect_uris: ['nowhere'] },
      { scopes: [''] },
    ]);
  });
});

describe('named texts', () => {
  const names: readonly (readonly [string, z.ZodType, number])[] = [
    ['HOME_NAME', HOME_NAME, 80],
    ['CLIENT_NAME', CLIENT_NAME, 80],
    ['ROOM_NAME', ROOM_NAME, 60],
    ['DEVICE_NAME', DEVICE_NAME, 120],
    ['REMOTE_NAME', REMOTE_NAME, 80],
    ['BUTTON_NAME', BUTTON_NAME, 60],
    ['SCENE_NAME', SCENE_NAME, 80],
    ['AUTOMATION_NAME', AUTOMATION_NAME, 80],
    ['HEALTH_SOURCE_NAME', HEALTH_SOURCE_NAME, 80],
    ['TOKEN_NAME', TOKEN_NAME, 80],
  ];

  it.each(names)('%s trims and accepts up to %i characters', (_name, schema, longest) => {
    expect(schema.parse(` ${'x'.repeat(longest)} `)).toBe('x'.repeat(longest));
    expect(accepts(schema, 'x'.repeat(longest + 1))).toBe(false);
    expect(accepts(schema, ' ')).toBe(false);
  });
});

const ROW_SAMPLES = {
  settings,
  clients: client,
  provider_links: providerLink,
  rooms: room,
  devices: device,
  device_state: state,
  state_history: history,
  commands: command,
  events: event,
  cameras: camera,
  recordings: recording,
  ir_remotes: irRemote,
  ir_codes: irCode,
  scenes: scene,
  automations: automation,
  layouts: layout,
  push_targets: pushTarget,
  health_sources: healthSource,
  health_daily: healthDaily,
  mcp_tokens: mcpToken,
  oauth_clients: oauthClient,
} as const;

const HUB = { version: '1.4.0', startedAt: AT, cameras: 'running' };

describe('live tables', () => {
  it('LIVE_TABLES lists every table the live socket streams, in order', () => {
    expect(LIVE_TABLES).toStrictEqual([
      'settings',
      'clients',
      'provider_links',
      'rooms',
      'devices',
      'device_state',
      'state_history',
      'commands',
      'events',
      'cameras',
      'recordings',
      'ir_remotes',
      'ir_codes',
      'scenes',
      'automations',
      'layouts',
      'push_targets',
      'health_sources',
      'health_daily',
      'mcp_tokens',
      'oauth_clients',
    ]);
    expect(Object.keys(TABLE_ROWS)).toStrictEqual(LIVE_TABLES);
  });

  it('TABLE_ROWS validates every table with its own row schema', () => {
    expect(Object.entries(TABLE_ROWS)).toStrictEqual([
      ['settings', SETTINGS_ROW],
      ['clients', CLIENT_ROW],
      ['provider_links', PROVIDER_LINK_ROW],
      ['rooms', ROOM_ROW],
      ['devices', DEVICE_ROW],
      ['device_state', STATE_ROW],
      ['state_history', HISTORY_ROW],
      ['commands', COMMAND_ROW],
      ['events', EVENT_ROW],
      ['cameras', CAMERA_ROW],
      ['recordings', RECORDING_ROW],
      ['ir_remotes', IR_REMOTE_ROW],
      ['ir_codes', IR_CODE_ROW],
      ['scenes', SCENE_ROW],
      ['automations', AUTOMATION_ROW],
      ['layouts', LAYOUT_ROW],
      ['push_targets', PUSH_TARGET_ROW],
      ['health_sources', HEALTH_SOURCE_ROW],
      ['health_daily', HEALTH_DAILY_ROW],
      ['mcp_tokens', MCP_TOKEN_ROW],
      ['oauth_clients', OAUTH_CLIENT_ROW],
    ]);
  });

  it('OWNER_TABLES holds exactly the tables only an owner may stream', () => {
    expect([...OWNER_TABLES]).toStrictEqual([
      'clients',
      'push_targets',
      'mcp_tokens',
      'oauth_clients',
      'plugins',
    ]);
  });

  it('OWN_ROW_TABLES holds exactly the tables streamed only for the calling client', () => {
    expect([...OWN_ROW_TABLES]).toStrictEqual(['layouts']);
  });

  it('ROW_OPERATIONS lists exactly insert, update and delete', () => {
    expect(ROW_OPERATIONS).toStrictEqual(['INSERT', 'UPDATE', 'DELETE']);
  });
});

describe('row changes', () => {
  it.each(LIVE_TABLES)('ROW_CHANGE accepts a change of %s carrying its own rows', (table) => {
    const row = ROW_SAMPLES[table];
    for (const change of [
      { type: 'change', table, operation: 'INSERT', record: row, oldRecord: null },
      { type: 'change', table, operation: 'UPDATE', record: row, oldRecord: row },
      { type: 'change', table, operation: 'DELETE', record: null, oldRecord: row },
    ]) {
      expect(ROW_CHANGE.parse(change)).toStrictEqual(change);
    }
  });

  it.each(LIVE_TABLES)(
    'ROW_CHANGE refuses a change of %s carrying a row of another table',
    (table) => {
      const other = table === 'rooms' ? ROW_SAMPLES.clients : ROW_SAMPLES.rooms;
      const change = { type: 'change', table, operation: 'INSERT', oldRecord: null };
      expect(accepts(ROW_CHANGE, { ...change, record: other })).toBe(false);
      expect(accepts(ROW_CHANGE, { ...change, record: null, oldRecord: other })).toBe(false);
    },
  );

  it('ROW_CHANGE refuses unknown tables, operations and message types', () => {
    const change = {
      type: 'change',
      table: 'rooms',
      operation: 'INSERT',
      record: room,
      oldRecord: null,
    };
    expect(accepts(ROW_CHANGE, { ...change, table: 'users' })).toBe(false);
    expect(accepts(ROW_CHANGE, { ...change, operation: 'TRUNCATE' })).toBe(false);
    expect(accepts(ROW_CHANGE, { ...change, type: 'ready' })).toBe(false);
  });
});

describe('live messages', () => {
  it('HUB_STATUS keeps the hub version, start and camera service state', () => {
    expect(HUB_STATUS.parse(HUB)).toStrictEqual(HUB);
    expect(HUB_STATUS.parse({ ...HUB, cameras: 'stopped' })).toStrictEqual({
      ...HUB,
      cameras: 'stopped',
    });
    expect(accepts(HUB_STATUS, { ...HUB, cameras: 'crashed' })).toBe(false);
    expect(accepts(HUB_STATUS, { ...HUB, version: '' })).toBe(false);
  });

  it('LIVE_SERVER_MESSAGE accepts every message the server sends', () => {
    for (const message of [
      { type: 'change', table: 'rooms', operation: 'UPDATE', record: room, oldRecord: room },
      { type: 'ready', clientId: FIRST, role: 'owner', hub: HUB },
      { type: 'subscribed', tables: ['rooms', 'devices'] },
      { type: 'presence', hub: HUB },
      { type: 'refused', error: { code: 'forbidden', message: 'Owners only.' } },
    ]) {
      expect(LIVE_SERVER_MESSAGE.parse(message)).toStrictEqual(message);
    }
  });

  it('LIVE_SERVER_MESSAGE refuses malformed messages', () => {
    for (const message of [
      { type: 'ready', clientId: 'me', role: 'owner', hub: HUB },
      { type: 'ready', clientId: FIRST, role: 'guest', hub: HUB },
      { type: 'subscribed', tables: ['users'] },
      { type: 'presence', hub: HUB, extra: 1 },
      { type: 'refused', error: { code: 'teapot', message: 'No.' } },
      { type: 'refused', error: { code: 'forbidden', message: '' } },
      { type: 'hello' },
    ]) {
      expect(accepts(LIVE_SERVER_MESSAGE, message)).toBe(false);
    }
  });

  it('LIVE_CLIENT_MESSAGE accepts a subscription to known tables only', () => {
    const message = { type: 'subscribe', tables: ['rooms', 'layouts'] };
    expect(LIVE_CLIENT_MESSAGE.parse(message)).toStrictEqual(message);
    expect(accepts(LIVE_CLIENT_MESSAGE, { type: 'subscribe', tables: ['users'] })).toBe(false);
    expect(accepts(LIVE_CLIENT_MESSAGE, { type: 'unsubscribe', tables: [] })).toBe(false);
    expect(accepts(LIVE_CLIENT_MESSAGE, { ...message, extra: 1 })).toBe(false);
  });
});
