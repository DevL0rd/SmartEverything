import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CAMERA, LAMP } from '../support/fake-provider';
import { bootServer, linkFakeProvider, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, openLive, temporaryDirectory } from '../support/server';
import { answerOf, callTool, structured, type ToolResult } from './client';

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;
let token: string;
let lamp: string;
let camera: string;

const NAMED = z.array(z.object({ name: z.string() }));
const HOST_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const NOT_FOUND_ID = '0d000000-0000-4000-8000-000000000001';

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
  await verifiedPublicUrl(booted);
  await owner('POST', '/api/rooms', { name: 'Study', position: 0 });
  await owner('POST', '/api/rooms', { name: 'Hall', position: 1 });
  await linkFakeProvider(booted);
  const created = await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/mcp/tokens',
    body: { name: 'ChatGPT' },
  });
  token = API_ENDPOINTS.createMcpToken.response.parse(created.body).token;
  const devices = API_ENDPOINTS.listDevices.response.parse(
    (await call(booted.base, booted.owner, { method: 'GET', path: '/api/devices' })).body,
  );
  lamp = devices.find((device) => device.external_id === LAMP.externalId)?.id ?? '';
  camera = devices.find((device) => device.external_id === CAMERA.externalId)?.id ?? '';
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

function tool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  return callTool(booted.base, token, name, args);
}

async function refusal(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await tool(name, args);
  expect(result.isError).toBe(true);
  return JSON.stringify(result.content);
}

function change(
  capability: string,
  value: unknown,
  deviceIds: readonly string[],
): Record<string, unknown> {
  return { changes: [{ target: { deviceIds }, capability, value }] };
}

async function owner(method: string, path: string, body?: unknown): Promise<unknown> {
  const reply = await call(booted.base, booted.owner, { method, path, body });
  expect(reply.status, JSON.stringify(reply.body)).toBe(200);
  return reply.body;
}

describe('the home tools', () => {
  it('describe the home, its rooms and its linked providers', async () => {
    const home = structured(await tool('get_home'));
    const computers = z
      .array(z.object({ family: z.string() }))
      .parse(structured(await tool('find_devices'))['devices'])
      .filter((device) => device.family === 'computer');
    expect(home['homes']).toStrictEqual([
      {
        name: 'Home',
        time_zone: HOST_TIME_ZONE,
        latitude: null,
        longitude: null,
        role: 'owner',
        rooms: 2,
        devices: 2 + computers.length,
        people: 1,
      },
    ]);
    const rooms = z
      .array(z.object({ name: z.string(), devices: z.array(z.object({ id: z.string() })) }))
      .parse(home['rooms']);
    expect(rooms.map((room) => [room.name, room.devices.length]).sort()).toStrictEqual([
      ['Hall', 1],
      ['Study', 1],
    ]);
    expect(home['providers']).toMatchObject([
      { provider: 'xiaomi', status: 'linked', device_count: 2, waiting_for: null },
    ]);
  });

  it('refuse an argument get_home does not declare', async () => {
    expect(await refusal('get_home', { homeId: lamp })).toContain('not valid');
  });

  it('list, filter, describe and search devices', async () => {
    const ids = (args: Record<string, unknown>): Promise<string[]> =>
      tool('find_devices', args).then((result) =>
        z
          .array(z.object({ id: z.string(), family: z.string() }))
          .parse(structured(result)['devices'])
          .filter((device) => device.family !== 'computer')
          .map((device) => device.id),
      );
    expect((await ids({})).sort()).toStrictEqual([lamp, camera].sort());
    expect(await ids({ capability: 'brightness' })).toStrictEqual([lamp]);
    expect(await ids({ kinds: ['camera'] })).toStrictEqual([camera]);
    expect(await ids({ search: 'FRONT' })).toStrictEqual([camera]);
    expect(await ids({ search: 'study' })).toStrictEqual([lamp]);
    await owner('PATCH', `/api/devices/${camera}`, { hidden: true });
    expect(await ids({})).toStrictEqual([lamp]);
    expect((await ids({ includeHidden: true })).sort()).toStrictEqual([lamp, camera].sort());
    const described = structured(await tool('get_device', { deviceId: camera }));
    expect(described['device']).toMatchObject({
      name: 'Front door',
      camera: { physical_ptz: true, two_way_audio: false },
    });
    expect(described['capabilities']).toMatchObject([{ key: 'privacy_mode' }]);
    expect(described['device']).toHaveProperty('capabilities', ['privacy_mode']);
    expect(await refusal('get_device', { deviceId: NOT_FOUND_ID })).toContain('There is no device');
    expect(await refusal('get_device', { deviceId: 'nope' })).toContain('deviceId');
    const found = structured(await tool('search_everything', { query: 'dim' }));
    expect(found['capabilities']).toStrictEqual([
      { key: 'brightness', label: 'Brightness', devices: 1 },
    ]);
    const desk = structured(await tool('search_everything', { query: 'desk' }));
    expect(NAMED.parse(desk['devices']).map((device) => device.name)).toStrictEqual(['Desk lamp']);
  });
});

describe('the control tools', () => {
  it('validate a device command, issue it as the assistant and wait for its result', async () => {
    expect(await refusal('control_devices', change('brightness', 150, [lamp]))).toContain(
      'outside 1 to 100',
    );
    expect(await refusal('control_devices', change('temperature', 20, [lamp]))).toContain(
      'is read-only',
    );
    expect(await refusal('control_devices', change('hub:unlink_provider', {}, [lamp]))).toContain(
      'has no hub:unlink_provider',
    );
    expect(await refusal('control_devices', change('power', true, [NOT_FOUND_ID]))).toContain(
      'No device matches',
    );
    const done = structured(await tool('control_devices', change('power', false, [lamp])));
    expect(done).toStrictEqual({
      ok: true,
      summary: 'Controlled devices: 1 of 1 commands done',
      changed: [{ device: 'Desk lamp', capability: 'power' }],
    });
    booted.fake.adapter.failure = new Error('The lamp is unplugged');
    const failed = structured(await tool('control_devices', change('power', true, [lamp])));
    expect(failed).toMatchObject({
      ok: false,
      summary: 'Controlled devices: 0 of 1 commands done, 1 failed',
      failed: [
        { device: 'Desk lamp', capability: 'power', reason: 'Error: The lamp is unplugged' },
      ],
    });
  });

  it('run a scene and list scenes', async () => {
    const scene = API_ENDPOINTS.createScene.response.parse(
      await owner('POST', '/api/scenes', {
        name: 'Evening',
        actions: [
          { type: 'command', deviceId: lamp, capability: 'brightness', value: 30 },
          { type: 'command', deviceId: lamp, capability: 'power', value: true },
        ],
      }),
    );
    const empty = API_ENDPOINTS.createScene.response.parse(
      await owner('POST', '/api/scenes', { name: 'Empty', actions: [] }),
    );
    const ran = structured(await tool('run_scene', { sceneId: scene.id }));
    expect(ran).toMatchObject({
      ok: true,
      id: scene.id,
      summary: 'Ran scene “Evening”: 2 of 2 commands done',
    });
    const sources = API_ENDPOINTS.listCommands.response
      .parse(await owner('GET', '/api/commands'))
      .map((command) => command.source);
    expect(sources).toStrictEqual(['scene', 'scene']);
    expect(await refusal('run_scene', { sceneId: empty.id })).toContain('has no actions');
    expect(await refusal('run_scene', { sceneId: NOT_FOUND_ID })).toContain('There is no scene');
    expect(structured(await tool('list_scenes'))['scenes']).toMatchObject([
      { name: 'Empty', actions: [] },
      {
        name: 'Evening',
        actions: [
          { type: 'command', capability: 'brightness', value: 30, device: 'Desk lamp' },
          { type: 'command', capability: 'power', value: true, device: 'Desk lamp' },
        ],
      },
    ]);
  });
});

describe('the history, event, health and camera tools', () => {
  it('return history raw or bucketed, and refuse buckets of values that are not numbers', async () => {
    const live = await openLive(booted.base, booted.owner);
    live.socket.send(JSON.stringify({ type: 'subscribe', tables: ['state_history'], streams: [] }));
    await live.next((message) => message.type === 'subscribed');
    for (let index = 0; index < 9; index += 1) {
      booted.fake.adapter.sink?.state({
        externalId: LAMP.externalId,
        capability: 'temperature',
        value: 20 + index,
        observedAt: new Date(Date.UTC(2026, 0, 1, 0, index * 20)).toISOString(),
      });
      await live.next(
        (message) =>
          message.type === 'change' &&
          message.table === 'state_history' &&
          message.record?.value === 20 + index,
      );
    }
    live.socket.close();
    const range = { from: '2026-01-01T00:00:00Z', to: '2026-01-01T03:00:00Z' };
    const raw = structured(
      await tool('get_history', { deviceId: lamp, capability: 'temperature', ...range }),
    );
    expect(raw).toMatchObject({ kind: 'number', bucket: 'raw' });
    expect(z.array(z.unknown()).parse(raw['points'])).toHaveLength(9);
    const hourly = structured(
      await tool('get_history', {
        deviceId: lamp,
        capability: 'temperature',
        bucket: 'hour',
        ...range,
      }),
    );
    expect(hourly['points']).toStrictEqual([
      { bucket: '2026-01-01T00:00:00.000Z', average: 21, minimum: 20, maximum: 22, samples: 3 },
      { bucket: '2026-01-01T01:00:00.000Z', average: 24, minimum: 23, maximum: 25, samples: 3 },
      { bucket: '2026-01-01T02:00:00.000Z', average: 27, minimum: 26, maximum: 28, samples: 3 },
    ]);
    expect(
      await refusal('get_history', {
        deviceId: lamp,
        capability: 'power',
        bucket: 'day',
        ...range,
      }),
    ).toContain('only numbers can be bucketed');
    expect(
      await refusal('get_history', {
        deviceId: lamp,
        capability: 'temperature',
        from: range.to,
        to: range.from,
      }),
    ).toContain('from must be before to');
    expect(
      await refusal('get_history', {
        deviceId: lamp,
        capability: 'temperature',
        from: '2026-01-01T00:00:00Z',
        to: '2026-06-01T00:00:00Z',
      }),
    ).toContain('must not exceed 92 days');
    expect(
      await refusal('get_history', { deviceId: lamp, capability: 'humidity', ...range }),
    ).toContain('has no capability');
  });

  it('list events by kind and return the latest snapshot as an image', async () => {
    const live = await openLive(booted.base, booted.owner);
    live.socket.send(
      JSON.stringify({ type: 'subscribe', tables: ['recordings', 'events'], streams: [] }),
    );
    await live.next((message) => message.type === 'subscribed');
    const happened = (externalId: string, kind: 'motion' | 'doorbell', hour: number): void => {
      booted.fake.adapter.sink?.event({
        externalId,
        kind,
        occurredAt: new Date(Date.UTC(2026, 9, 8, hour)).toISOString(),
        details: {},
      });
    };
    happened(LAMP.externalId, 'motion', 9);
    happened(CAMERA.externalId, 'doorbell', 10);
    await live.next(
      (message) =>
        message.type === 'change' &&
        message.table === 'recordings' &&
        message.record?.kind === 'snapshot',
    );
    live.socket.close();
    const motion = structured(await tool('list_events', { kinds: ['motion'] }));
    expect(motion['events']).toMatchObject([{ kind: 'motion', device: 'Desk lamp' }]);
    const all = structured(await tool('list_events', { deviceIds: [camera], kinds: ['doorbell'] }));
    expect(all['events']).toMatchObject([{ kind: 'doorbell', device: 'Front door' }]);
    const snapshot = await tool('camera_pictures', { view: 'saved', deviceId: camera });
    expect(snapshot.isError).toBe(false);
    expect(snapshot.content[1]).toStrictEqual({
      type: 'image',
      data: Buffer.from([0xff, 0xd8, 0xff]).toString('base64'),
      mimeType: 'image/jpeg',
    });
    expect(answerOf(snapshot.content)).toMatchObject({
      deviceId: camera,
      device: 'Front door',
      mimeType: 'image/jpeg',
    });
    expect(await refusal('camera_pictures', { view: 'saved', deviceId: lamp })).toContain(
      'has no saved snapshot',
    );
  });

  it('summarise health days for a range and a set of metrics', async () => {
    API_ENDPOINTS.createHealthSource.response.parse(
      await owner('POST', '/api/health/sources', { name: 'Pixel' }),
    );
    const steps = (day: string, count: number): Record<string, unknown> => ({
      recordId: `steps-${day}`,
      type: 'Steps',
      startTime: `${day}T06:00:00Z`,
      endTime: `${day}T07:00:00Z`,
      zoneOffsetSeconds: 0,
      sourceApp: 'fit',
      lastModified: `${day}T07:00:00Z`,
      data: { count },
    });
    const ingested = await call(booted.base, booted.owner, {
      method: 'POST',
      path: '/api/health/ingest',
      body: {
        records: [steps('2026-01-01', 8000), steps('2026-01-02', 9000)],
        deletions: [],
        grantedTypes: ['Steps'],
        source: { device: 'Pixel', appVersion: '1.0' },
      },
    });
    expect(ingested.status).toBe(200);
    const range = { from: '2026-01-01', to: '2026-01-02' };
    const summary = (args: Record<string, unknown>): Promise<ToolResult> =>
      tool('read_health', { view: 'summary', ...args });
    const days = (result: ToolResult): unknown =>
      z
        .array(z.object({ days: z.array(z.unknown()) }))
        .parse(structured(result)['people'])
        .flatMap((person) => person.days);
    expect(days(await summary({ ...range, metrics: ['steps'] }))).toStrictEqual([
      { day: '2026-01-01', metric: 'steps', value: 8000, unit: 'count' },
      { day: '2026-01-02', metric: 'steps', value: 9000, unit: 'count' },
    ]);
    expect(days(await summary(range))).toHaveLength(2);
    expect(
      await refusal('read_health', { view: 'summary', from: range.to, to: range.from }),
    ).toContain('from must not be after to');
  });
});
