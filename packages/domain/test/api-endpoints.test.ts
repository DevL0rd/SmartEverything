import { describe, expect, it } from 'vitest';
import { API_ENDPOINTS, buildPath, matchPath } from '../src';

const FIRST = '00000000-0000-4000-8000-000000000001';
const AT = '2026-10-08T07:00:00Z';
const LATER = '2026-10-09T07:00:00Z';

const CORE_ROUTES = {
  status: { method: 'GET', path: '/status', access: 'public' },
  session: { method: 'GET', path: '/api/session', access: 'member' },
  startPairing: { method: 'POST', path: '/api/pair/start', access: 'owner' },
  proveHub: { method: 'POST', path: '/api/pair/proof', access: 'public' },
  claimPairing: { method: 'POST', path: '/api/pair/claim', access: 'public' },
  listClients: { method: 'GET', path: '/api/clients', access: 'owner' },
  updateClient: { method: 'PATCH', path: '/api/clients/:clientId', access: 'owner' },
  removeClient: { method: 'DELETE', path: '/api/clients/:clientId', access: 'owner' },
  rotateOwnerToken: { method: 'POST', path: '/api/owner-token/rotate', access: 'owner' },
  readSettings: { method: 'GET', path: '/api/settings', access: 'member' },
  updateHome: { method: 'PATCH', path: '/api/settings/home', access: 'owner' },
  updateNetwork: { method: 'PATCH', path: '/api/settings/network', access: 'owner' },
  setPublicUrl: { method: 'PUT', path: '/api/settings/public-url', access: 'owner' },
  verifyPublicUrl: { method: 'POST', path: '/api/settings/public-url/verify', access: 'owner' },
  setPushAccount: { method: 'PUT', path: '/api/settings/push', access: 'owner' },
  clearPushAccount: { method: 'DELETE', path: '/api/settings/push', access: 'owner' },
  readPushStatus: { method: 'GET', path: '/api/settings/push/status', access: 'owner' },
  listProviders: { method: 'GET', path: '/api/providers', access: 'member' },
  linkProvider: { method: 'POST', path: '/api/providers/link', access: 'owner' },
  answerProviderPrompt: { method: 'POST', path: '/api/providers/answer', access: 'owner' },
  cancelProviderLink: { method: 'POST', path: '/api/providers/cancel', access: 'owner' },
  readSmartThingsApp: { method: 'GET', path: '/api/providers/smartthings/app', access: 'owner' },
  authorizeSmartThings: {
    method: 'POST',
    path: '/api/providers/smartthings/authorize',
    access: 'owner',
  },
  listRooms: { method: 'GET', path: '/api/rooms', access: 'member' },
  createRoom: { method: 'POST', path: '/api/rooms', access: 'member' },
  updateRoom: { method: 'PATCH', path: '/api/rooms/:roomId', access: 'member' },
  removeRoom: { method: 'DELETE', path: '/api/rooms/:roomId', access: 'member' },
  listDevices: { method: 'GET', path: '/api/devices', access: 'member' },
  updateDevice: { method: 'PATCH', path: '/api/devices/:deviceId', access: 'member' },
  listState: { method: 'GET', path: '/api/device-state', access: 'member' },
  readHistory: { method: 'GET', path: '/api/history', access: 'member' },
  readHistoryBuckets: { method: 'GET', path: '/api/history/buckets', access: 'member' },
  listCommands: { method: 'GET', path: '/api/commands', access: 'member' },
  readCommand: { method: 'GET', path: '/api/commands/:commandId', access: 'member' },
  sendCommand: { method: 'POST', path: '/api/commands', access: 'member' },
  sendCommands: { method: 'POST', path: '/api/commands/batch', access: 'member' },
  listEvents: { method: 'GET', path: '/api/events', access: 'member' },
  acknowledgeEvent: { method: 'POST', path: '/api/events/:eventId/acknowledge', access: 'member' },
  listCameras: { method: 'GET', path: '/api/cameras', access: 'member' },
  updateCamera: { method: 'PATCH', path: '/api/cameras/:deviceId', access: 'member' },
  offerCamera: { method: 'POST', path: '/api/cameras/:deviceId/webrtc', access: 'member' },
  cameraStream: { method: 'POST', path: '/api/cameras/:deviceId/mse', access: 'member' },
  cameraSnapshot: { method: 'GET', path: '/api/cameras/:deviceId/snapshot', access: 'member' },
  listRecordings: { method: 'GET', path: '/api/recordings', access: 'member' },
  recordingLinks: { method: 'POST', path: '/api/recordings/links', access: 'member' },
  removeRecording: { method: 'DELETE', path: '/api/recordings/:recordingId', access: 'member' },
  listIrRemotes: { method: 'GET', path: '/api/ir-remotes', access: 'member' },
  createIrRemote: { method: 'POST', path: '/api/ir-remotes', access: 'member' },
  removeIrRemote: { method: 'DELETE', path: '/api/ir-remotes/:remoteId', access: 'member' },
  updateIrRemote: { method: 'PATCH', path: '/api/ir-remotes/:remoteId/state', access: 'member' },
  listIrCodes: { method: 'GET', path: '/api/ir-codes', access: 'member' },
  saveIrCode: { method: 'PUT', path: '/api/ir-codes', access: 'member' },
  removeIrCode: { method: 'DELETE', path: '/api/ir-codes/:codeId', access: 'member' },
  listScenes: { method: 'GET', path: '/api/scenes', access: 'member' },
  createScene: { method: 'POST', path: '/api/scenes', access: 'member' },
  updateScene: { method: 'PATCH', path: '/api/scenes/:sceneId', access: 'member' },
  orderScenes: { method: 'PUT', path: '/api/scenes/order', access: 'member' },
  removeScene: { method: 'DELETE', path: '/api/scenes/:sceneId', access: 'member' },
  runScene: { method: 'POST', path: '/api/scenes/:sceneId/run', access: 'member' },
  listAutomations: { method: 'GET', path: '/api/automations', access: 'member' },
  createAutomation: { method: 'POST', path: '/api/automations', access: 'member' },
  updateAutomation: { method: 'PATCH', path: '/api/automations/:automationId', access: 'member' },
  removeAutomation: { method: 'DELETE', path: '/api/automations/:automationId', access: 'member' },
  readLayout: { method: 'GET', path: '/api/layouts/:page', access: 'member' },
  saveLayout: { method: 'PUT', path: '/api/layouts/:page', access: 'member' },
  listPushTargets: { method: 'GET', path: '/api/push-targets', access: 'owner' },
  savePushTarget: { method: 'PUT', path: '/api/push-targets', access: 'member' },
  removePushTarget: { method: 'DELETE', path: '/api/push-targets', access: 'member' },
  listHealthSources: { method: 'GET', path: '/api/health/sources', access: 'member' },
  createHealthSource: { method: 'POST', path: '/api/health/sources', access: 'member' },
  revokeHealthSource: { method: 'DELETE', path: '/api/health/sources/:clientId', access: 'member' },
  ingestHealth: { method: 'POST', path: '/api/health/ingest', access: 'member' },
  readHealthDaily: { method: 'GET', path: '/api/health/daily', access: 'member' },
  readBestDay: { method: 'GET', path: '/api/health/daily/best', access: 'member' },
  readHealthRecords: { method: 'GET', path: '/api/health/records', access: 'member' },
  readHealthRecord: { method: 'GET', path: '/api/health/records/:recordId', access: 'member' },
  readHealthSightings: { method: 'GET', path: '/api/health/sightings', access: 'member' },
  listMcpTokens: { method: 'GET', path: '/api/mcp/tokens', access: 'owner' },
  createMcpToken: { method: 'POST', path: '/api/mcp/tokens', access: 'owner' },
  revokeMcpToken: { method: 'DELETE', path: '/api/mcp/tokens/:tokenId', access: 'owner' },
  listOAuthGrants: { method: 'GET', path: '/api/oauth/grants', access: 'owner' },
  revokeOAuthGrant: { method: 'DELETE', path: '/api/oauth/grants/:clientId', access: 'owner' },
  createApprovalCode: { method: 'POST', path: '/oauth/approval-code', access: 'owner' },
} as const;

type Name = keyof typeof API_ENDPOINTS;

type CoreName = keyof typeof CORE_ROUTES;

function isCoreName(name: string): name is CoreName {
  return name in CORE_ROUTES;
}

const CORE_NAMES = Object.keys(CORE_ROUTES).filter(isCoreName);

const NAMES = Object.keys(API_ENDPOINTS).filter((name): name is Name => name in API_ENDPOINTS);

function placeholdersOf(path: string): readonly string[] {
  return path
    .split('/')
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1));
}

const SAMPLE_PARAMS: Readonly<Record<string, string>> = {
  page: 'home',
  runtime: 'claude',
  id: 'google/gemini-3.8-flash',
  memberKind: 'client',
  pluginId: 'my-plugin',
  source: 'sample',
  voice: 'Sadachbia',
  pid: '4242',
};

function sampleParam(name: string): string {
  return SAMPLE_PARAMS[name] ?? FIRST;
}

function paramsOf(path: string): Record<string, string> {
  return Object.fromEntries(placeholdersOf(path).map((name) => [name, sampleParam(name)]));
}

function accepts(name: Name, part: 'params' | 'query' | 'body', value: unknown): boolean {
  return API_ENDPOINTS[name][part].safeParse(value).success;
}

describe('the endpoint table', () => {
  it('keeps the method, path and access of the core routes clients depend on', () => {
    for (const name of CORE_NAMES) {
      const { method, path, access } = API_ENDPOINTS[name];
      expect({ method, path, access }).toStrictEqual(CORE_ROUTES[name]);
    }
  });

  it('gives every endpoint a summary sentence and a known method', () => {
    for (const name of NAMES) {
      expect(API_ENDPOINTS[name].summary.trim()).not.toBe('');
      expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(API_ENDPOINTS[name].method);
    }
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
      'updateIrRemote',
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

function takesNoQuery(name: Name): boolean {
  const parsed = API_ENDPOINTS[name].query.safeParse({});
  return parsed.success && Object.keys(parsed.data).length === 0;
}

function queryNeedsNothing(name: Name): boolean {
  return API_ENDPOINTS[name].query.safeParse({}).success;
}

describe('endpoint queries', () => {
  it.each(NAMES.filter(takesNoQuery))('%s takes no query', (name) => {
    expect(API_ENDPOINTS[name].query.parse({})).toStrictEqual({});
    expect(accepts(name, 'query', { limit: '1' })).toBe(false);
  });

  it.each(NAMES.filter(queryNeedsNothing))(
    '%s refuses a query parameter it does not name',
    (name) => {
      expect(accepts(name, 'query', { unnamed: '1' })).toBe(false);
    },
  );

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
