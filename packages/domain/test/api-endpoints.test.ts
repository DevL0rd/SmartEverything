import { describe, expect, it } from 'vitest';
import { API_ENDPOINTS, buildPath, matchPath } from '../src';

const FIRST = '00000000-0000-4000-8000-000000000001';
const AT = '2026-10-08T07:00:00Z';
const LATER = '2026-10-09T07:00:00Z';

const TABLE = {
  status: {
    method: 'GET',
    path: '/status',
    access: 'public',
    summary: 'Whether the server is up, its version and whether its public URL is verified',
  },
  session: {
    method: 'GET',
    path: '/api/session',
    access: 'member',
    summary: 'The calling client and the hub status',
  },
  startPairing: {
    method: 'POST',
    path: '/api/pair/start',
    access: 'owner',
    summary: 'A one-time pairing code and the QR payload a phone scans',
  },
  claimPairing: {
    method: 'POST',
    path: '/api/pair/claim',
    access: 'public',
    summary: 'Exchange a pairing code for a device token, returned once',
  },
  listClients: {
    method: 'GET',
    path: '/api/clients',
    access: 'owner',
    summary: 'Every paired client',
  },
  updateClient: {
    method: 'PATCH',
    path: '/api/clients/:clientId',
    access: 'owner',
    summary: 'Rename a client or change its role',
  },
  removeClient: {
    method: 'DELETE',
    path: '/api/clients/:clientId',
    access: 'owner',
    summary: 'Unpair a client; its token stops working at once',
  },
  rotateOwnerToken: {
    method: 'POST',
    path: '/api/owner-token/rotate',
    access: 'owner',
    summary: 'Replace the owner token; the old one stops working at once',
  },
  readSettings: {
    method: 'GET',
    path: '/api/settings',
    access: 'member',
    summary: 'The home, remote access and push settings, without secrets',
  },
  updateHome: {
    method: 'PATCH',
    path: '/api/settings/home',
    access: 'owner',
    summary: 'Rename the home or change its time zone and location',
  },
  updateNetwork: {
    method: 'PATCH',
    path: '/api/settings/network',
    access: 'owner',
    summary: 'The ICE servers and WebRTC candidates cameras offer away from home',
  },
  setPublicUrl: {
    method: 'PUT',
    path: '/api/settings/public-url',
    access: 'owner',
    summary: 'Save the public HTTPS URL; it stays unverified until verified',
  },
  verifyPublicUrl: {
    method: 'POST',
    path: '/api/settings/public-url/verify',
    access: 'owner',
    summary: 'Fetch a fresh nonce from this server through the public URL',
  },
  setPushAccount: {
    method: 'PUT',
    path: '/api/settings/push',
    access: 'owner',
    summary: 'Store the Firebase service account used to send push notifications',
  },
  clearPushAccount: {
    method: 'DELETE',
    path: '/api/settings/push',
    access: 'owner',
    summary: 'Forget the Firebase service account',
  },
  readPushStatus: {
    method: 'GET',
    path: '/api/settings/push/status',
    access: 'owner',
    summary: 'Push deliveries so far and the last failure reason',
  },
  listProviders: {
    method: 'GET',
    path: '/api/providers',
    access: 'member',
    summary: 'Every provider link, its status, prompt and last error',
  },
  sealingKey: {
    method: 'GET',
    path: '/api/providers/key',
    access: 'owner',
    summary: 'The public key provider credentials and prompt answers are sealed to',
  },
  readSmartThingsApp: {
    method: 'GET',
    path: '/api/providers/smartthings/app',
    access: 'owner',
    summary: 'SmartThings client id, redirect and webhook URLs, webhook state',
  },
  saveSmartThingsApp: {
    method: 'PUT',
    path: '/api/providers/smartthings/app',
    access: 'owner',
    summary: 'Save the SmartThings client id and secret in the secret store',
  },
  forgetSmartThingsApp: {
    method: 'DELETE',
    path: '/api/providers/smartthings/app',
    access: 'owner',
    summary: 'Forget the SmartThings client id and secret',
  },
  authorizeSmartThings: {
    method: 'POST',
    path: '/api/providers/smartthings/authorize',
    access: 'owner',
    summary: 'A SmartThings sign-in URL with a ten-minute state',
  },
  listRooms: {
    method: 'GET',
    path: '/api/rooms',
    access: 'member',
    summary: 'Every room in order',
  },
  createRoom: {
    method: 'POST',
    path: '/api/rooms',
    access: 'member',
    summary: 'Add a room',
  },
  updateRoom: {
    method: 'PATCH',
    path: '/api/rooms/:roomId',
    access: 'member',
    summary: 'Rename or reorder a room',
  },
  removeRoom: {
    method: 'DELETE',
    path: '/api/rooms/:roomId',
    access: 'member',
    summary: 'Remove a room; its devices become unplaced',
  },
  listDevices: {
    method: 'GET',
    path: '/api/devices',
    access: 'member',
    summary: 'Every device with its capabilities',
  },
  updateDevice: {
    method: 'PATCH',
    path: '/api/devices/:deviceId',
    access: 'member',
    summary: 'Rename, place, hide, favourite or reorder a device',
  },
  listState: {
    method: 'GET',
    path: '/api/device-state',
    access: 'member',
    summary: 'The latest value of every capability of every device',
  },
  readHistory: {
    method: 'GET',
    path: '/api/history',
    access: 'member',
    summary: 'State changes of the named capabilities in a time range',
  },
  readHistoryBuckets: {
    method: 'GET',
    path: '/api/history/buckets',
    access: 'member',
    summary: 'State changes aggregated into fixed time buckets',
  },
  listCommands: {
    method: 'GET',
    path: '/api/commands',
    access: 'member',
    summary: 'The most recent commands, newest first',
  },
  readCommand: {
    method: 'GET',
    path: '/api/commands/:commandId',
    access: 'member',
    summary: 'One command and its outcome',
  },
  sendCommand: {
    method: 'POST',
    path: '/api/commands',
    access: 'member',
    summary: 'Ask a device or the hub to do something; the outcome arrives on /live',
  },
  sendCommands: {
    method: 'POST',
    path: '/api/commands/batch',
    access: 'member',
    summary: 'Several commands at once, validated together',
  },
  listEvents: {
    method: 'GET',
    path: '/api/events',
    access: 'member',
    summary: 'Events, newest first, optionally for some devices and a time range',
  },
  acknowledgeEvent: {
    method: 'POST',
    path: '/api/events/:eventId/acknowledge',
    access: 'member',
    summary: 'Mark an event as seen or a call as answered',
  },
  listCameras: {
    method: 'GET',
    path: '/api/cameras',
    access: 'member',
    summary: 'Every camera, its stream, PTZ, two-way audio and recording setting',
  },
  updateCamera: {
    method: 'PATCH',
    path: '/api/cameras/:deviceId',
    access: 'member',
    summary: 'Change whether a camera records events and how readily it hears the AI’s name',
  },
  offerCamera: {
    method: 'POST',
    path: '/api/cameras/:deviceId/webrtc',
    access: 'member',
    summary: 'Relay a WebRTC offer to go2rtc and return its answer with gathered candidates',
  },
  cameraStream: {
    method: 'POST',
    path: '/api/cameras/:deviceId/mse',
    access: 'member',
    summary: 'A short-lived signed WebSocket path for the MSE stream when WebRTC cannot connect',
  },
  cameraSnapshot: {
    method: 'GET',
    path: '/api/cameras/:deviceId/snapshot',
    access: 'member',
    summary: 'A short-lived signed path to a JPEG frame of the live stream',
  },
  listRecordings: {
    method: 'GET',
    path: '/api/recordings',
    access: 'member',
    summary: 'Snapshots and clips, newest first, optionally for some cameras and a time range',
  },
  recordingLinks: {
    method: 'POST',
    path: '/api/recordings/links',
    access: 'member',
    summary: 'Short-lived signed paths that download recordings without a bearer token',
  },
  removeRecording: {
    method: 'DELETE',
    path: '/api/recordings/:recordingId',
    access: 'member',
    summary: 'Delete a recording and its file',
  },
  listIrRemotes: {
    method: 'GET',
    path: '/api/ir-remotes',
    access: 'member',
    summary: 'Every remote taught to an IR blaster',
  },
  createIrRemote: {
    method: 'POST',
    path: '/api/ir-remotes',
    access: 'member',
    summary: 'Add a remote to an IR blaster',
  },
  removeIrRemote: {
    method: 'DELETE',
    path: '/api/ir-remotes/:remoteId',
    access: 'member',
    summary: 'Remove a remote and its codes',
  },
  listIrCodes: {
    method: 'GET',
    path: '/api/ir-codes',
    access: 'member',
    summary: 'Every learned or library IR code',
  },
  saveIrCode: {
    method: 'PUT',
    path: '/api/ir-codes',
    access: 'member',
    summary: 'Save the code of a button, replacing the one it had',
  },
  removeIrCode: {
    method: 'DELETE',
    path: '/api/ir-codes/:codeId',
    access: 'member',
    summary: 'Forget the code of a button',
  },
  listScenes: {
    method: 'GET',
    path: '/api/scenes',
    access: 'member',
    summary: 'Every scene in order',
  },
  createScene: {
    method: 'POST',
    path: '/api/scenes',
    access: 'member',
    summary: 'Add a scene',
  },
  updateScene: {
    method: 'PATCH',
    path: '/api/scenes/:sceneId',
    access: 'member',
    summary: 'Change a scene',
  },
  orderScenes: {
    method: 'PUT',
    path: '/api/scenes/order',
    access: 'member',
    summary: 'Put the scenes in the given order',
  },
  removeScene: {
    method: 'DELETE',
    path: '/api/scenes/:sceneId',
    access: 'member',
    summary: 'Delete a scene',
  },
  runScene: {
    method: 'POST',
    path: '/api/scenes/:sceneId/run',
    access: 'member',
    summary: 'Send every action of a scene as a command with source scene',
  },
  listAutomations: {
    method: 'GET',
    path: '/api/automations',
    access: 'member',
    summary: 'Every automation by name',
  },
  createAutomation: {
    method: 'POST',
    path: '/api/automations',
    access: 'member',
    summary: 'Add an automation',
  },
  updateAutomation: {
    method: 'PATCH',
    path: '/api/automations/:automationId',
    access: 'member',
    summary: 'Change, enable or pause an automation; a new definition clears its last error',
  },
  removeAutomation: {
    method: 'DELETE',
    path: '/api/automations/:automationId',
    access: 'member',
    summary: 'Delete an automation',
  },
  readLayout: {
    method: 'GET',
    path: '/api/layouts/:page',
    access: 'member',
    summary: 'The calling client’s saved layout or setting for a page',
  },
  saveLayout: {
    method: 'PUT',
    path: '/api/layouts/:page',
    access: 'member',
    summary: 'Save the calling client’s layout or setting for a page',
  },
  listPushTargets: {
    method: 'GET',
    path: '/api/push-targets',
    access: 'owner',
    summary: 'Every phone registered for push notifications',
  },
  savePushTarget: {
    method: 'PUT',
    path: '/api/push-targets',
    access: 'member',
    summary: 'Register the calling phone’s Firebase token',
  },
  removePushTarget: {
    method: 'DELETE',
    path: '/api/push-targets',
    access: 'member',
    summary: 'Forget a Firebase token of the calling phone',
  },
  listHealthSources: {
    method: 'GET',
    path: '/api/health/sources',
    access: 'member',
    summary: 'Every phone allowed to upload health data',
  },
  createHealthSource: {
    method: 'POST',
    path: '/api/health/sources',
    access: 'member',
    summary: 'Allow the calling phone to upload health data; the upload token is returned once',
  },
  revokeHealthSource: {
    method: 'DELETE',
    path: '/api/health/sources/:sourceId',
    access: 'member',
    summary: 'Stop accepting uploads with a health source token',
  },
  ingestHealth: {
    method: 'POST',
    path: '/api/health/ingest',
    access: 'health_source',
    summary: 'Upload a batch of Health Connect records and deletions',
  },
  readHealthDaily: {
    method: 'GET',
    path: '/api/health/daily',
    access: 'member',
    summary: 'Daily figures of the named metrics between two days',
  },
  readBestDay: {
    method: 'GET',
    path: '/api/health/daily/best',
    access: 'member',
    summary: 'The day with the highest, or lowest, figure of a metric',
  },
  readHealthRecords: {
    method: 'GET',
    path: '/api/health/records',
    access: 'member',
    summary: 'Records of the named types that overlap a time range',
  },
  readHealthRecord: {
    method: 'GET',
    path: '/api/health/records/:recordId',
    access: 'member',
    summary: 'One record by its Health Connect id',
  },
  readHealthSightings: {
    method: 'GET',
    path: '/api/health/sightings',
    access: 'member',
    summary: 'Which apps wrote which record types since a moment',
  },
  listMcpTokens: {
    method: 'GET',
    path: '/api/mcp/tokens',
    access: 'owner',
    summary: 'Every personal MCP token, without the token itself',
  },
  createMcpToken: {
    method: 'POST',
    path: '/api/mcp/tokens',
    access: 'owner',
    summary: 'Create a personal MCP token; it is returned once',
  },
  revokeMcpToken: {
    method: 'DELETE',
    path: '/api/mcp/tokens/:tokenId',
    access: 'owner',
    summary: 'Revoke a personal MCP token',
  },
  listOAuthGrants: {
    method: 'GET',
    path: '/api/oauth/grants',
    access: 'owner',
    summary: 'Every assistant allowed through OAuth and not revoked',
  },
  revokeOAuthGrant: {
    method: 'DELETE',
    path: '/api/oauth/grants/:clientId',
    access: 'owner',
    summary: 'Revoke an assistant’s access',
  },
  createApprovalCode: {
    method: 'POST',
    path: '/oauth/approval-code',
    access: 'owner',
    summary: 'A fresh six-digit approval code and its expiry, replacing the last one',
  },
};

type Name = keyof typeof API_ENDPOINTS;

const NAMES = Object.keys(API_ENDPOINTS).filter((name): name is Name => name in API_ENDPOINTS);

function placeholdersOf(path: string): readonly string[] {
  return path
    .split('/')
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1));
}

function sampleParam(name: string): string {
  return name === 'page' ? 'home' : FIRST;
}

function paramsOf(path: string): Record<string, string> {
  return Object.fromEntries(placeholdersOf(path).map((name) => [name, sampleParam(name)]));
}

function accepts(name: Name, part: 'params' | 'query' | 'body', value: unknown): boolean {
  return API_ENDPOINTS[name][part].safeParse(value).success;
}

describe('the endpoint table', () => {
  it('API_ENDPOINTS gives every endpoint its method, path, access and summary', () => {
    const described = Object.fromEntries(
      NAMES.map((name) => {
        const { method, path, access, summary } = API_ENDPOINTS[name];
        return [name, { method, path, access, summary }];
      }),
    );
    expect(described).toStrictEqual(TABLE);
  });

  it('gives every endpoint a distinct method and path', () => {
    const routes = NAMES.map((name) => `${API_ENDPOINTS[name].method} ${API_ENDPOINTS[name].path}`);
    expect(new Set(routes).size).toBe(NAMES.length);
  });

  it('gives every endpoint a distinct summary sentence', () => {
    const summaries = NAMES.map((name) => API_ENDPOINTS[name].summary);
    expect(new Set(summaries).size).toBe(NAMES.length);
  });
});

describe('endpoint parameters', () => {
  it.each(NAMES)('%s accepts exactly the parameters its path names', (name) => {
    const { path, params } = API_ENDPOINTS[name];
    const sample = paramsOf(path);
    expect(params.parse(sample)).toStrictEqual(sample);
    expect(matchPath(path, buildPath(path, sample))).toStrictEqual(sample);
    expect(accepts(name, 'params', { ...sample, extra: FIRST })).toBe(false);
  });

  it.each(NAMES.filter((name) => placeholdersOf(API_ENDPOINTS[name].path).length > 0))(
    '%s refuses a missing or empty parameter',
    (name) => {
      const sample = paramsOf(API_ENDPOINTS[name].path);
      const [first] = Object.keys(sample);
      expect(accepts(name, 'params', {})).toBe(false);
      expect(accepts(name, 'params', { ...sample, [first!]: '' })).toBe(false);
    },
  );

  it('id parameters refuse anything but a UUID', () => {
    for (const name of [
      'updateClient',
      'removeClient',
      'updateRoom',
      'removeRoom',
      'updateDevice',
      'readCommand',
      'acknowledgeEvent',
      'updateCamera',
      'offerCamera',
      'cameraStream',
      'cameraSnapshot',
      'removeRecording',
      'removeIrRemote',
      'removeIrCode',
      'updateScene',
      'removeScene',
      'runScene',
      'updateAutomation',
      'removeAutomation',
      'revokeHealthSource',
      'revokeMcpToken',
    ] as const) {
      const [parameter] = placeholdersOf(API_ENDPOINTS[name].path);
      expect(accepts(name, 'params', { [parameter!]: 'abc' })).toBe(false);
    }
  });

  it('health record and OAuth client ids accept one to 200 characters', () => {
    expect(API_ENDPOINTS.readHealthRecord.params.parse({ recordId: 'r' })).toStrictEqual({
      recordId: 'r',
    });
    expect(
      API_ENDPOINTS.readHealthRecord.params.parse({ recordId: 'r'.repeat(200) }),
    ).toStrictEqual({
      recordId: 'r'.repeat(200),
    });
    expect(accepts('readHealthRecord', 'params', { recordId: 'r'.repeat(201) })).toBe(false);
    expect(API_ENDPOINTS.revokeOAuthGrant.params.parse({ clientId: 'claude' })).toStrictEqual({
      clientId: 'claude',
    });
    expect(accepts('revokeOAuthGrant', 'params', { clientId: 'c'.repeat(201) })).toBe(false);
  });

  it('layout pages refuse names that are not lower-case page names', () => {
    expect(accepts('readLayout', 'params', { page: 'Home' })).toBe(false);
    expect(accepts('saveLayout', 'params', { page: 'a b' })).toBe(false);
  });
});

const QUERIED: readonly Name[] = [
  'readHistory',
  'readHistoryBuckets',
  'listCommands',
  'listEvents',
  'listRecordings',
  'readHealthDaily',
  'readBestDay',
  'readHealthRecords',
  'readHealthSightings',
  'readTalk',
];

describe('endpoint queries', () => {
  it.each(NAMES.filter((name) => !QUERIED.includes(name)))('%s takes no query', (name) => {
    expect(API_ENDPOINTS[name].query.parse({})).toStrictEqual({});
    expect(accepts(name, 'query', { limit: '1' })).toBe(false);
  });

  it('readHistory reads capabilities, devices, range, order and limit from query text', () => {
    const query = API_ENDPOINTS.readHistory.query;
    expect(query.parse({ capabilities: 'power,brightness', from: AT })).toStrictEqual({
      capabilities: ['power', 'brightness'],
      from: AT,
      order: 'asc',
      limit: 5000,
    });
    expect(
      query.parse({
        capabilities: 'power',
        from: AT,
        to: LATER,
        deviceIds: FIRST,
        order: 'desc',
        limit: '20000',
      }),
    ).toStrictEqual({
      capabilities: ['power'],
      from: AT,
      to: LATER,
      deviceIds: [FIRST],
      order: 'desc',
      limit: 20_000,
    });
    for (const change of [
      { order: 'up' },
      { limit: '20001' },
      { limit: '0' },
      { from: undefined },
      { capabilities: undefined },
      { deviceIds: 'x' },
      { to: 'later' },
    ]) {
      expect(accepts('readHistory', 'query', { capabilities: 'power', from: AT, ...change })).toBe(
        false,
      );
    }
  });

  it('readHistoryBuckets reads a closed range and a bucket of one minute to 31 days', () => {
    const query = API_ENDPOINTS.readHistoryBuckets.query;
    const base = { capabilities: 'power', from: AT, to: LATER };
    for (const [text, seconds] of [
      ['60', 60],
      ['3600', 3600],
      ['2678400', 2_678_400],
    ] as const) {
      expect(query.parse({ ...base, bucketSeconds: text })).toStrictEqual({
        capabilities: ['power'],
        from: AT,
        to: LATER,
        bucketSeconds: seconds,
      });
    }
    expect(query.parse({ ...base, deviceIds: FIRST, bucketSeconds: '60' })).toStrictEqual({
      capabilities: ['power'],
      from: AT,
      to: LATER,
      deviceIds: [FIRST],
      bucketSeconds: 60,
    });
    for (const change of [
      { bucketSeconds: '59' },
      { bucketSeconds: '2678401' },
      { bucketSeconds: '90.5' },
      { bucketSeconds: undefined },
      { to: undefined },
    ]) {
      expect(
        accepts('readHistoryBuckets', 'query', { ...base, bucketSeconds: '60', ...change }),
      ).toBe(false);
    }
  });

  it('listCommands reads a limit of 1 to 500 that defaults to 50', () => {
    const query = API_ENDPOINTS.listCommands.query;
    expect(query.parse({})).toStrictEqual({ limit: 50 });
    expect(query.parse({ limit: '500' })).toStrictEqual({ limit: 500 });
    expect(accepts('listCommands', 'query', { limit: '501' })).toBe(false);
  });

  it('listEvents reads an optional window and a limit of 1 to 1000 that defaults to 100', () => {
    const query = API_ENDPOINTS.listEvents.query;
    expect(query.parse({})).toStrictEqual({ limit: 100 });
    expect(
      query.parse({ from: AT, to: LATER, deviceIds: `${FIRST},${FIRST}`, limit: '1000' }),
    ).toStrictEqual({ from: AT, to: LATER, deviceIds: [FIRST, FIRST], limit: 1000 });
    expect(accepts('listEvents', 'query', { limit: '1001' })).toBe(false);
  });

  it('listRecordings reads an optional window and a limit of 1 to 1000 that defaults to 200', () => {
    const query = API_ENDPOINTS.listRecordings.query;
    expect(query.parse({})).toStrictEqual({ limit: 200 });
    expect(query.parse({ from: AT, to: LATER, deviceIds: FIRST, limit: '1000' })).toStrictEqual({
      from: AT,
      to: LATER,
      deviceIds: [FIRST],
      limit: 1000,
    });
    expect(accepts('listRecordings', 'query', { limit: '1001' })).toBe(false);
  });

  it('readHealthDaily reads two days and a list of known metrics', () => {
    const query = API_ENDPOINTS.readHealthDaily.query;
    expect(
      query.parse({ from: '2026-10-01', to: '2026-10-08', metrics: 'steps,weight' }),
    ).toStrictEqual({ from: '2026-10-01', to: '2026-10-08', metrics: ['steps', 'weight'] });
    expect(
      accepts('readHealthDaily', 'query', {
        from: '2026-10-01',
        to: '2026-10-08',
        metrics: 'mood',
      }),
    ).toBe(false);
    expect(
      accepts('readHealthDaily', 'query', { from: AT, to: '2026-10-08', metrics: 'steps' }),
    ).toBe(false);
  });

  it('readBestDay reads a metric and whether to find the lowest day, highest by default', () => {
    const query = API_ENDPOINTS.readBestDay.query;
    expect(query.parse({ metric: 'steps' })).toStrictEqual({ metric: 'steps', lowest: false });
    expect(query.parse({ metric: 'weight', lowest: 'true' })).toStrictEqual({
      metric: 'weight',
      lowest: true,
    });
    expect(accepts('readBestDay', 'query', { metric: 'steps', lowest: 'yes' })).toBe(false);
    expect(accepts('readBestDay', 'query', { metric: 'mood' })).toBe(false);
  });

  it('readHealthRecords reads a list of record types and a range of moments', () => {
    const query = API_ENDPOINTS.readHealthRecords.query;
    expect(query.parse({ types: 'Steps,HeartRate', from: AT, to: LATER })).toStrictEqual({
      types: ['Steps', 'HeartRate'],
      from: AT,
      to: LATER,
    });
    expect(accepts('readHealthRecords', 'query', { types: 'Mood', from: AT, to: LATER })).toBe(
      false,
    );
    expect(accepts('readHealthRecords', 'query', { types: 'Steps', from: AT })).toBe(false);
  });

  it('readHealthSightings reads the moment to look back to', () => {
    expect(API_ENDPOINTS.readHealthSightings.query.parse({ since: AT })).toStrictEqual({
      since: AT,
    });
    expect(accepts('readHealthSightings', 'query', {})).toBe(false);
  });
});
