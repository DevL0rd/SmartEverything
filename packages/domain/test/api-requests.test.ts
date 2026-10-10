import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { API_ENDPOINTS, COMMAND_INPUT, PUSH_SERVICE_ACCOUNT } from '../src';
import { PAIRED_PLATFORMS } from '../src/api/endpoints-access';

const FIRST = '00000000-0000-4000-8000-000000000001';
const SECOND = '00000000-0000-4000-8000-000000000002';
const PATCH_MESSAGE = 'name at least one field to change';

type Name = keyof typeof API_ENDPOINTS;

const NAMES = Object.keys(API_ENDPOINTS).filter((name): name is Name => name in API_ENDPOINTS);

const BODIED: readonly Name[] = [
  'startPairing',
  'claimPairing',
  'updateClient',
  'updateHome',
  'updateNetwork',
  'setPublicUrl',
  'setPushAccount',
  'saveSmartThingsApp',
  'createRoom',
  'updateRoom',
  'updateDevice',
  'sendCommand',
  'sendCommands',
  'updateCamera',
  'offerCamera',
  'recordingLinks',
  'createIrRemote',
  'saveIrCode',
  'createScene',
  'updateScene',
  'orderScenes',
  'createAutomation',
  'updateAutomation',
  'saveLayout',
  'savePushTarget',
  'removePushTarget',
  'createHealthSource',
  'ingestHealth',
  'createMcpToken',
];

const ACTION = { type: 'command', deviceId: SECOND, capability: 'power', value: true };

const DEFINITION = {
  triggers: [{ type: 'interval', everyMinutes: 5 }],
  conditions: { mode: 'all', items: [] },
  actions: [{ type: 'notify', message: 'Ran.' }],
};

const SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: 'home-push',
  client_email: 'push@home-push.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nkey-body\n-----END PRIVATE KEY-----\n',
  token_uri: 'https://oauth2.googleapis.com/token',
};

const STEPS = {
  recordId: 'r1',
  type: 'Steps',
  startTime: '2026-10-08T06:00:00Z',
  endTime: '2026-10-08T07:00:00Z',
  zoneOffsetSeconds: 0,
  sourceApp: 'com.mi.health',
  lastModified: '2026-10-08T07:01:00Z',
  data: { count: 10 },
};

function bodyOf(name: Name): z.ZodType {
  return API_ENDPOINTS[name].body;
}

function expectKept(name: Name, body: unknown): void {
  expect(bodyOf(name).parse(body)).toStrictEqual(body);
}

function expectRefused(name: Name, bodies: readonly unknown[]): void {
  for (const body of bodies) {
    expect(bodyOf(name).safeParse(body).success).toBe(false);
  }
}

function expectPatch(name: Name, fields: Readonly<Record<string, unknown>>): void {
  expect(bodyOf(name).safeParse({}).error?.issues[0]?.message).toBe(PATCH_MESSAGE);
  expectKept(name, fields);
  for (const [key, value] of Object.entries(fields)) {
    expectKept(name, { [key]: value });
  }
  expectRefused(name, [{ ...fields, unknown: 1 }]);
}

describe('bodiless endpoints', () => {
  it.each(NAMES.filter((name) => !BODIED.includes(name)))('%s takes no body', (name) => {
    expect(bodyOf(name).parse(undefined)).toBeUndefined();
    expectRefused(name, [{}]);
  });
});

describe('access request bodies', () => {
  it('startPairing takes the role the new client gets', () => {
    expectKept('startPairing', { role: 'member' });
    expectKept('startPairing', { role: 'owner' });
    expectRefused('startPairing', [{ role: 'admin' }, {}, { role: 'member', extra: 1 }]);
  });

  it('claimPairing takes a code, a client name and an Android or web platform', () => {
    expect(PAIRED_PLATFORMS).toStrictEqual(['android', 'web']);
    const claim = { code: 'ABCD-2345', name: 'Pixel 9', platform: 'android' };
    expectKept('claimPairing', claim);
    expectKept('claimPairing', { ...claim, platform: 'web' });
    expect(bodyOf('claimPairing').parse({ ...claim, name: ' Pixel 9 ' })).toStrictEqual(claim);
    expectRefused('claimPairing', [
      { ...claim, platform: 'desktop' },
      { ...claim, code: 'abcd-2345' },
      { ...claim, name: '' },
      { ...claim, extra: 1 },
    ]);
  });

  it('updateClient changes the name or the role', () => {
    expectPatch('updateClient', { name: 'Tablet', role: 'owner' });
    expectRefused('updateClient', [{ role: 'admin' }, { name: '' }]);
  });
});

describe('settings request bodies', () => {
  it('updateHome changes the name, time zone or location', () => {
    expectPatch('updateHome', {
      home_name: 'Cottage',
      time_zone: 'Europe/London',
      latitude: 51.5,
      longitude: -0.12,
    });
    expectKept('updateHome', { latitude: null, longitude: null });
    expectKept('updateHome', { time_zone: 'UTC' });
    expectRefused('updateHome', [
      { time_zone: 'Mars/Base' },
      { latitude: 91 },
      { longitude: -181 },
      { home_name: ' ' },
    ]);
  });

  it('updateNetwork changes the ICE servers or WebRTC candidates', () => {
    expectPatch('updateNetwork', {
      ice_servers: [{ urls: ['turn:turn.example.com'], username: 'u', credential: 'c' }],
      webrtc_candidates: ['203.0.113.7:8555'],
    });
    expectKept('updateNetwork', { ice_servers: [], webrtc_candidates: [] });
    expectRefused('updateNetwork', [
      { ice_servers: [{ urls: [] }] },
      { webrtc_candidates: ['a b'] },
    ]);
  });

  it('setPublicUrl takes an https URL without a query, or null', () => {
    expectKept('setPublicUrl', { url: 'https://home.example.com' });
    expectKept('setPublicUrl', { url: null });
    expectRefused('setPublicUrl', [
      { url: 'http://home.example.com' },
      { url: 'https://home.example.com/?a=1' },
      {},
      { url: null, extra: 1 },
    ]);
  });

  it('setPushAccount takes a Firebase service account and drops its other fields', () => {
    expectKept('setPushAccount', { serviceAccount: SERVICE_ACCOUNT });
    expect(
      bodyOf('setPushAccount').parse({
        serviceAccount: { ...SERVICE_ACCOUNT, private_key_id: 'k1', client_id: '42' },
      }),
    ).toStrictEqual({ serviceAccount: SERVICE_ACCOUNT });
    expectRefused('setPushAccount', [{ serviceAccount: SERVICE_ACCOUNT, extra: 1 }, {}]);
  });

  it('saveSmartThingsApp takes a trimmed client id and secret of up to 200 characters', () => {
    expectKept('saveSmartThingsApp', { clientId: 'id', clientSecret: 's'.repeat(200) });
    expect(
      bodyOf('saveSmartThingsApp').parse({ clientId: ' id ', clientSecret: ' s ' }),
    ).toStrictEqual({ clientId: 'id', clientSecret: 's' });
    expectRefused('saveSmartThingsApp', [
      { clientId: ' ', clientSecret: 's' },
      { clientId: 'id', clientSecret: '' },
      { clientId: 'i'.repeat(201), clientSecret: 's' },
      { clientId: 'id', clientSecret: 's'.repeat(201) },
      { clientId: 'id' },
      { clientId: 'id', clientSecret: 's', extra: 1 },
    ]);
  });

  it('PUSH_SERVICE_ACCOUNT refuses anything but a complete Google service account', () => {
    expect(PUSH_SERVICE_ACCOUNT.parse(SERVICE_ACCOUNT)).toStrictEqual(SERVICE_ACCOUNT);
    for (const change of [
      { type: 'authorized_user' },
      { project_id: '' },
      { client_email: 'push' },
      { private_key: 'key-body' },
      { private_key: 'key-body-----BEGIN PRIVATE KEY-----' },
      { token_uri: 'http://oauth2.googleapis.com/token' },
      { token_uri: 'xhttps://oauth2.googleapis.com/token' },
      { token_uri: 'https2://oauth2.googleapis.com/token' },
    ]) {
      expect(PUSH_SERVICE_ACCOUNT.safeParse({ ...SERVICE_ACCOUNT, ...change }).success).toBe(false);
    }
  });
});

describe('device request bodies', () => {
  it('createRoom takes a name and places the room first by default', () => {
    expect(bodyOf('createRoom').parse({ name: 'Kitchen' })).toStrictEqual({
      name: 'Kitchen',
      position: 0,
    });
    expectKept('createRoom', { name: 'Kitchen', position: 3 });
    expectRefused('createRoom', [{ name: '' }, { name: 'Kitchen', position: -1 }, {}]);
  });

  it('updateRoom changes the name or position', () => {
    expectPatch('updateRoom', { name: 'Hall', position: 2 });
    expectRefused('updateRoom', [{ position: -1 }]);
  });

  it('updateDevice changes the name, room, visibility, favourite or position', () => {
    expectPatch('updateDevice', {
      display_name: 'Big light',
      room_id: FIRST,
      hidden: true,
      favourite: false,
      position: 4,
    });
    expectKept('updateDevice', { display_name: null, room_id: null });
    expectRefused('updateDevice', [
      { room_id: 'kitchen' },
      { hidden: 'yes' },
      { display_name: '' },
    ]);
  });

  it('sendCommand takes a command that comes from the app by default', () => {
    const command = { device_id: FIRST, capability: 'power', value: true };
    expect(bodyOf('sendCommand').parse(command)).toStrictEqual({ ...command, source: 'app' });
    for (const source of ['app', 'automation', 'scene']) {
      expectKept('sendCommand', { ...command, source });
    }
    expectKept('sendCommand', {
      device_id: null,
      capability: 'hub:discover',
      value: { a: [1] },
      source: 'app',
    });
    expectKept('sendCommand', { ...command, capability: 'c'.repeat(120), source: 'app' });
    expectRefused('sendCommand', [
      { ...command, source: 'assistant' },
      { ...command, capability: '' },
      { ...command, capability: 'c'.repeat(121) },
      { ...command, extra: 1 },
    ]);
    expect(COMMAND_INPUT.parse({ ...command, capability: 'ab' })).toStrictEqual({
      ...command,
      capability: 'ab',
      source: 'app',
    });
  });

  it('sendCommands takes one to 100 commands', () => {
    const command = { device_id: FIRST, capability: 'power', value: true, source: 'scene' };
    expectKept('sendCommands', { commands: [command] });
    expectKept('sendCommands', { commands: [command, command] });
    expectKept('sendCommands', { commands: Array.from({ length: 100 }, () => command) });
    expectRefused('sendCommands', [
      { commands: [] },
      { commands: Array.from({ length: 101 }, () => command) },
    ]);
  });
});

describe('media request bodies', () => {
  it('updateCamera changes event recording or the wake sensitivity', () => {
    expectKept('updateCamera', { record_events: true });
    expectKept('updateCamera', { record_events: false });
    expectKept('updateCamera', { wake_sensitivity: 'high' });
    expectKept('updateCamera', { record_events: false, wake_sensitivity: 'highest' });
    expectRefused('updateCamera', [
      {},
      { record_events: 'on' },
      { record_events: true, x: 1 },
      { wake_sensitivity: 'loud' },
    ]);
  });

  it('offerCamera takes an SDP offer of up to 200,000 characters', () => {
    expectKept('offerCamera', { sdp: 'v' });
    expectKept('offerCamera', { sdp: 'v=0' });
    expectKept('offerCamera', { sdp: 'v'.repeat(200_000) });
    expectRefused('offerCamera', [{ sdp: '' }, { sdp: 'v'.repeat(200_001) }, {}]);
  });

  it('recordingLinks takes one to 200 recording ids', () => {
    expectKept('recordingLinks', { ids: [FIRST] });
    expectKept('recordingLinks', { ids: [FIRST, SECOND] });
    expectKept('recordingLinks', { ids: Array.from({ length: 200 }, () => FIRST) });
    expectRefused('recordingLinks', [
      { ids: [] },
      { ids: Array.from({ length: 201 }, () => FIRST) },
      { ids: ['r1'] },
    ]);
  });

  it('createIrRemote takes a blaster, name, category and optional brand', () => {
    const remote = { blaster_id: FIRST, name: 'TV remote', category: 'tv', brand: 'Sony' };
    expectKept('createIrRemote', remote);
    expectKept('createIrRemote', { ...remote, category: 'c'.repeat(40), brand: 'b'.repeat(80) });
    expectKept('createIrRemote', { ...remote, brand: null });
    expectRefused('createIrRemote', [
      { ...remote, category: '' },
      { ...remote, category: 'c'.repeat(41) },
      { ...remote, brand: '' },
      { ...remote, brand: 'b'.repeat(81) },
      { ...remote, name: '' },
      { ...remote, extra: 1 },
    ]);
  });

  it('saveIrCode takes a button code of up to 20,000 characters in a known format', () => {
    const code = { remote_id: FIRST, button: 'Power', format: 'pulses', code: '9000,4500' };
    expectKept('saveIrCode', code);
    expectKept('saveIrCode', { ...code, format: 'library', code: 'c'.repeat(20_000) });
    expectRefused('saveIrCode', [
      { ...code, code: '' },
      { ...code, code: 'c'.repeat(20_001) },
      { ...code, format: 'hex' },
      { ...code, button: '' },
      { ...code, extra: 1 },
    ]);
  });
});

describe('scene and automation request bodies', () => {
  it('createScene takes a name and actions with a sparkles icon first by default', () => {
    expect(bodyOf('createScene').parse({ name: 'Movie night', actions: [ACTION] })).toStrictEqual({
      name: 'Movie night',
      icon: 'sparkles',
      actions: [ACTION],
      position: 0,
    });
    const scene = { name: 'Movie night', icon: 'film', actions: [], position: 2 };
    expectKept('createScene', scene);
    expectKept('createScene', { ...scene, icon: 'i'.repeat(40) });
    expectRefused('createScene', [
      { ...scene, icon: '' },
      { ...scene, icon: 'i'.repeat(41) },
      { ...scene, actions: [{ type: 'notify', message: 'x' }] },
      { ...scene, extra: 1 },
    ]);
  });

  it('updateScene changes the name, icon or actions', () => {
    expectPatch('updateScene', { name: 'Reading', icon: 'book', actions: [ACTION] });
    expectRefused('updateScene', [{ icon: '' }, { position: 1 }]);
  });

  it('orderScenes takes at least one scene id', () => {
    expectKept('orderScenes', { ids: [FIRST] });
    expectKept('orderScenes', { ids: [FIRST, SECOND] });
    expectRefused('orderScenes', [{ ids: [] }, { ids: ['s1'] }, { ids: [FIRST], extra: 1 }]);
  });

  it('createAutomation takes a name and a definition and enables it by default', () => {
    expect(
      bodyOf('createAutomation').parse({ name: 'Porch light', definition: DEFINITION }),
    ).toStrictEqual({ name: 'Porch light', enabled: true, definition: DEFINITION });
    expectKept('createAutomation', { name: 'Porch light', enabled: false, definition: DEFINITION });
    expectRefused('createAutomation', [
      { name: 'Porch light', definition: { ...DEFINITION, triggers: [] } },
      { name: '', definition: DEFINITION },
      { name: 'Porch light', definition: DEFINITION, extra: 1 },
    ]);
  });

  it('updateAutomation changes the name, enabled state or definition', () => {
    expectPatch('updateAutomation', { name: 'Porch', enabled: false, definition: DEFINITION });
    expectRefused('updateAutomation', [{ enabled: 'no' }]);
  });
});

describe('client request bodies', () => {
  it('saveLayout takes a layout object', () => {
    expectKept('saveLayout', { layout: { tiles: ['a'] } });
    expectRefused('saveLayout', [{ layout: [] }, { layout: null }, { layout: {}, extra: 1 }]);
  });

  it('savePushTarget takes an Android Firebase token', () => {
    expectKept('savePushTarget', { token: 'fcm-token', platform: 'android' });
    expectRefused('savePushTarget', [
      { token: 'fcm-token', platform: 'ios' },
      { token: '', platform: 'android' },
      { token: 't'.repeat(4097), platform: 'android' },
      { token: 'fcm-token', platform: 'android', extra: 1 },
    ]);
  });

  it('removePushTarget takes the token to forget', () => {
    expectKept('removePushTarget', { token: 'fcm-token' });
    expectRefused('removePushTarget', [{ token: '' }, {}, { token: 'fcm-token', extra: 1 }]);
  });
});

describe('health and assistant request bodies', () => {
  it('createHealthSource takes the name of the phone', () => {
    expectKept('createHealthSource', { name: 'Pixel 9' });
    expectRefused('createHealthSource', [{ name: '' }, { name: 'Pixel 9', extra: 1 }]);
  });

  it('ingestHealth takes a health batch', () => {
    const batch = {
      records: [STEPS],
      deletions: ['r0'],
      grantedTypes: ['Steps'],
      source: { device: 'Pixel 9', appVersion: '0.1.0' },
    };
    expectKept('ingestHealth', batch);
    expectRefused('ingestHealth', [{ ...batch, records: [STEPS, STEPS] }, {}]);
  });

  it('createMcpToken takes the name of the token', () => {
    expectKept('createMcpToken', { name: 'Laptop' });
    expectRefused('createMcpToken', [{ name: ' ' }, { name: 'Laptop', extra: 1 }]);
  });
});
