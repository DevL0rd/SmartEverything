import { API_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CAMERA, LAMP } from '../support/fake-provider';
import { bootServer, linkFakeProvider, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, openLive, temporaryDirectory } from '../support/server';
import { callTool, structured, type ToolResult } from './client';

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;
let token: string;
let lamp: string;
let camera: string;

const NAMED = z.array(z.object({ name: z.string() }));

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
  await verifiedPublicUrl(booted);
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

async function owner(method: string, path: string, body?: unknown): Promise<unknown> {
  const reply = await call(booted.base, booted.owner, { method, path, body });
  expect(reply.status, JSON.stringify(reply.body)).toBe(200);
  return reply.body;
}

describe('the home tools', () => {
  it('describe the home, its rooms and its linked providers', async () => {
    expect(structured(await tool('list_homes'))).toStrictEqual({
      homes: [{ name: 'Home', time_zone: 'UTC', role: 'owner', rooms: 2, devices: 2 }],
    });
    const rooms = z
      .array(z.object({ name: z.string(), devices: z.number() }))
      .parse(structured(await tool('list_rooms'))['rooms']);
    expect(rooms.map((room) => [room.name, room.devices]).sort()).toStrictEqual([
      ['Hall', 1],
      ['Study', 1],
    ]);
    expect(structured(await tool('list_providers'))['providers']).toMatchObject([
      { provider: 'xiaomi', status: 'linked', device_count: 2, waiting_for: null },
    ]);
  });

  it('list, filter, describe and search devices', async () => {
    const ids = (args: Record<string, unknown>): Promise<string[]> =>
      tool('list_devices', args).then((result) =>
        z
          .array(z.object({ id: z.string() }))
          .parse(structured(result)['devices'])
          .map((device) => device.id),
      );
    expect((await ids({})).sort()).toStrictEqual([lamp, camera].sort());
    expect(await ids({ capability: 'brightness' })).toStrictEqual([lamp]);
    expect(await ids({ kind: 'camera' })).toStrictEqual([camera]);
    expect(await ids({ search: 'FRONT' })).toStrictEqual([camera]);
    expect(await ids({ search: 'study' })).toStrictEqual([lamp]);
    await owner('PATCH', `/api/devices/${camera}`, { hidden: true });
    expect(await ids({})).toStrictEqual([lamp]);
    expect((await ids({ includeHidden: true })).sort()).toStrictEqual([lamp, camera].sort());
    const described = structured(await tool('get_device', { deviceId: camera }));
    expect(described['device']).toMatchObject({
      name: 'Front door',
      physical_ptz: true,
      two_way_audio: false,
      capabilities: [{ key: 'privacy_mode' }],
    });
    expect(
      await refusal('get_device', { deviceId: '0d000000-0000-4000-8000-000000000001' }),
    ).toContain('There is no device');
    expect(await refusal('get_device', { deviceId: 'nope' })).toContain('deviceId');
    const found = structured(await tool('search_everything', { query: 'dim' }));
    expect(found['capabilities']).toStrictEqual([
      { key: 'brightness', label: 'Brightness', group: 'lighting', devices: 1 },
    ]);
    const desk = structured(await tool('search_everything', { query: 'desk' }));
    expect(NAMED.parse(desk['devices']).map((device) => device.name)).toStrictEqual(['Desk lamp']);
  });
});

describe('the control tools', () => {
  it('validate a device command, issue it as the assistant and wait for its result', async () => {
    expect(
      await refusal('set_device', { deviceId: lamp, capability: 'brightness', value: 150 }),
    ).toContain('outside 1 to 100');
    expect(
      await refusal('set_device', { deviceId: lamp, capability: 'temperature', value: 20 }),
    ).toContain('it can only be read');
    expect(
      await refusal('set_device', { deviceId: lamp, capability: 'hub:unlink_provider', value: {} }),
    ).toContain('hub command');
    expect(
      await refusal('set_device', {
        deviceId: '0d000000-0000-4000-8000-000000000001',
        capability: 'power',
        value: true,
      }),
    ).toContain('There is no device');
    const done = structured(
      await tool('set_device', { deviceId: lamp, capability: 'power', value: false }),
    );
    expect(done).toMatchObject({
      allFinished: true,
      commands: [{ device_id: lamp, capability: 'power', value: false, status: 'succeeded' }],
    });
    booted.fake.adapter.failure = new Error('The lamp is unplugged');
    const failed = structured(
      await tool('set_device', { deviceId: lamp, capability: 'power', value: true }),
    );
    expect(failed).toMatchObject({ allFinished: true, commands: [{ status: 'failed' }] });
  });

  it('run a scene, list scenes and switch an automation off', async () => {
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
      scene: { id: scene.id, name: 'Evening' },
      allFinished: true,
      commands: [{ status: 'succeeded' }, { status: 'succeeded' }],
    });
    const sources = API_ENDPOINTS.listCommands.response
      .parse(await owner('GET', '/api/commands'))
      .map((command) => command.source);
    expect(sources).toStrictEqual(['scene', 'scene', 'app']);
    expect(await refusal('run_scene', { sceneId: empty.id })).toContain('has no actions');
    expect(
      await refusal('run_scene', { sceneId: '0d000000-0000-4000-8000-000000000001' }),
    ).toContain('There is no scene');
    expect(structured(await tool('list_scenes'))['scenes']).toMatchObject([
      { name: 'Empty', actions: 0 },
      { name: 'Evening', actions: 2 },
    ]);
    const automation = API_ENDPOINTS.createAutomation.response.parse(
      await owner('POST', '/api/automations', {
        name: 'Night check',
        definition: {
          triggers: [{ type: 'event', deviceId: null, kind: 'motion' }],
          conditions: { mode: 'all', items: [] },
          actions: [{ type: 'notify', message: 'Motion' }],
        },
      }),
    );
    expect(structured(await tool('list_automations'))['automations']).toMatchObject([
      { id: automation.id, name: 'Night check', enabled: true, run_count: 0 },
    ]);
    expect(
      structured(
        await tool('set_automation_enabled', { automationId: automation.id, enabled: false }),
      ),
    ).toStrictEqual({ automation: { id: automation.id, name: 'Night check', enabled: false } });
    expect(
      await refusal('set_automation_enabled', {
        automationId: '0d000000-0000-4000-8000-000000000001',
        enabled: true,
      }),
    ).toContain('There is no automation');
    const night = structured(await tool('search_everything', { query: 'night' }));
    expect(NAMED.parse(night['automations']).map((entry) => entry.name)).toStrictEqual([
      'Night check',
    ]);
  });
});

describe('the history, event, health and camera tools', () => {
  it('return history raw or bucketed, and refuse buckets of values that are not numbers', async () => {
    const live = await openLive(booted.base, booted.owner);
    live.socket.send(JSON.stringify({ type: 'subscribe', tables: ['state_history'] }));
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
    ).toContain('has no capability humidity');
  });

  it('list events by kind and return the latest snapshot as an image', async () => {
    const live = await openLive(booted.base, booted.owner);
    live.socket.send(JSON.stringify({ type: 'subscribe', tables: ['recordings', 'events'] }));
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
    const all = structured(await tool('list_events', { deviceId: camera }));
    expect(all['events']).toMatchObject([{ kind: 'doorbell', device: 'Front door' }]);
    const snapshot = await tool('get_camera_snapshot', { deviceId: camera });
    expect(snapshot.isError).toBe(false);
    expect(snapshot.content[0]).toStrictEqual({
      type: 'image',
      data: Buffer.from([0xff, 0xd8, 0xff]).toString('base64'),
      mimeType: 'image/jpeg',
    });
    expect(snapshot.structuredContent).toMatchObject({
      deviceId: camera,
      device: 'Front door',
      mimeType: 'image/jpeg',
    });
    expect(await refusal('get_camera_snapshot', { deviceId: lamp })).toContain(
      'There is no snapshot',
    );
  });

  it('summarise health days for a range and a set of metrics', async () => {
    const source = API_ENDPOINTS.createHealthSource.response.parse(
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
    const ingested = await call(booted.base, source.token, {
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
    expect(
      structured(await tool('get_health_summary', { ...range, metrics: ['steps'] })),
    ).toStrictEqual({
      days: [
        { day: '2026-01-01', metric: 'steps', value: 8000, unit: 'count' },
        { day: '2026-01-02', metric: 'steps', value: 9000, unit: 'count' },
      ],
    });
    expect(structured(await tool('get_health_summary', range))['days']).toHaveLength(2);
    expect(await refusal('get_health_summary', { from: range.to, to: range.from })).toContain(
      'from must not be after to',
    );
  });
});
