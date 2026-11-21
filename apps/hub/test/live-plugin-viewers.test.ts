import {
  PLUGIN_MANIFEST,
  createClientToken,
  hashClientToken,
  liveProtocols,
  type HubStatus,
  type PluginDataPoint,
} from '@smarteverything/domain';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import WebSocket from 'ws';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Viewers, deviceTarget, type DeviceDetail } from '../src/metrics/viewers';
import { routerPlugin } from '../src/plugins/builtin/router';
import { LIVE_STREAM } from '../src/plugins/builtin/router/streams';
import { LiveHub } from '../src/server/live';
import { testLogger } from './support/logs';
import { refusingUpgrades } from './support/socket-client';
import { testStore, type TestStore } from './support/store';
import { pause, until } from './support/wait';

const ROUTER_DEVICE = '7d1c2b8e-4a61-4c3f-9a52-1f0e6b2d9c41';
const AT = '2026-11-21T10:00:00.000Z';

const SUBSCRIBED = z.looseObject({ type: z.literal('subscribed') });
const INDEXED = z.looseObject({ value: z.looseObject({ index: z.number() }) });
const STREAM_FRAME = z.looseObject({
  type: z.literal('change'),
  table: z.literal('plugin_streams'),
  record: INDEXED.optional(),
  set: INDEXED.optional(),
});

let test: TestStore;
let hub: LiveHub;
let http: Server;
let port = 0;
const viewers = new Viewers<DeviceDetail>();
const sockets: WebSocket[] = [];

beforeEach(async () => {
  test = await testStore();
  hub = new LiveHub({
    store: test.store,
    status: (): HubStatus => ({
      version: 'test',
      startedAt: '2026-10-08T10:00:00.000Z',
      cameras: 'running',
    }),
    log: testLogger('live'),
  });
  hub.watches.attach({ viewers, allowed: () => true, keyframe: () => null });
  http = createServer();
  http.on(
    'upgrade',
    refusingUpgrades((request, socket, head) => hub.upgrade(request, socket, head)),
  );
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  port = typeof address === 'object' && address !== null ? address.port : 0;
});

afterEach(async () => {
  sockets.splice(0).forEach((socket) => {
    socket.terminate();
  });
  hub.stop();
  http.close();
  await test.close();
});

interface Listener {
  readonly socket: WebSocket;
  readonly indexes: number[];
}

async function listener(name: string): Promise<Listener> {
  const token = createClientToken();
  test.store.clients.create({
    name,
    platform: 'web',
    role: 'owner',
    tokenHash: hashClientToken(token),
  });
  const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/live`, [...liveProtocols(token)]);
  sockets.push(socket);
  const indexes: number[] = [];
  let subscribed = false;
  socket.on('message', (data: Buffer) => {
    const message: unknown = JSON.parse(data.toString('utf8'));
    if (SUBSCRIBED.safeParse(message).success) subscribed = true;
    const frame = STREAM_FRAME.safeParse(message);
    const row = frame.success ? (frame.data.record ?? frame.data.set) : undefined;
    if (row !== undefined) indexes.push(row.value.index);
  });
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'subscribe', tables: ['plugin_streams'], streams: [] }));
  await until(() => subscribed, `${name} subscribed`);
  return { socket, indexes };
}

function point(index: number): PluginDataPoint {
  return { stream: LIVE_STREAM, value: { index }, at: AT };
}

describe('plugin live frames meant for viewers', () => {
  it('reach only the connections watching the device, while everyone gets the quiet frames', async () => {
    const manifest = PLUGIN_MANIFEST.parse(routerPlugin.manifest);
    test.store.plugins.create({ manifest, source: 'builtin', location: 'builtin', trusted: true });
    const watcher = await listener('Router page');
    const settings = await listener('Settings page');
    watcher.socket.send(
      JSON.stringify({ type: 'watch', demands: [{ deviceId: ROUTER_DEVICE, topics: ['live'] }] }),
    );
    await until(() => viewers.watched(deviceTarget(ROUTER_DEVICE)), 'the router view');
    const streams = test.store.live.pluginStreams;
    streams.publish(manifest.id, point(0));
    for (let index = 1; index <= 29; index += 1) {
      streams.publishToViewers(manifest.id, point(index), ROUTER_DEVICE);
    }
    streams.publish(manifest.id, point(30));
    await until(() => watcher.indexes.length === 31, 'every frame at the router page');
    await until(() => settings.indexes.length === 2, 'the quiet frames at settings');
    await pause(20);
    expect(watcher.indexes).toEqual(Array.from({ length: 31 }, (_, index) => index));
    expect(settings.indexes).toEqual([0, 30]);
  });
});
