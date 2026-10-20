import { createClientToken, hashClientToken, liveProtocols } from '@smarteverything/domain';
import type { HubStatus } from '@smarteverything/domain';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import WebSocket from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LiveHub } from '../src/server/live';
import { testLogger } from './support/logs';
import { testStore, type TestStore } from './support/store';
import { until } from './support/wait';

let test: TestStore;
let hub: LiveHub;
let http: Server;
let port = 0;
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
  http = createServer();
  http.on('upgrade', (request, socket, head) => {
    hub.upgrade(request, socket, head);
  });
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

async function phone(background: boolean | undefined): Promise<{
  readonly clientId: string;
  readonly notices: string[];
}> {
  const token = createClientToken();
  const row = test.store.clients.create({
    name: 'Phone',
    platform: 'android',
    role: 'member',
    tokenHash: hashClientToken(token),
  });
  const notices: string[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/live`, [...liveProtocols(token)]);
  sockets.push(socket);
  let subscribed = false;
  socket.on('message', (data: Buffer) => {
    const message: unknown = JSON.parse(data.toString('utf8'));
    const type =
      typeof message === 'object' && message !== null && 'type' in message
        ? String(message.type)
        : '';
    if (type === 'subscribed') subscribed = true;
    else notices.push(type);
  });
  await once(socket, 'open');
  socket.send(
    JSON.stringify({
      type: 'subscribe',
      tables: [],
      streams: [],
      ...(background === undefined ? {} : { background }),
    }),
  );
  await until(() => subscribed, 'the subscription to be confirmed');
  return { clientId: row.id, notices };
}

describe('a connection from an app in the background', () => {
  it('is not counted as the phone being online, so the hub keeps reaching it as it does a closed app', async () => {
    const front = await phone(undefined);
    const back = await phone(true);
    expect([...hub.connectedClients()]).toStrictEqual([front.clientId]);
    expect(hub.connectedClients().has(back.clientId)).toBe(false);
  });

  it('is listed as a phone that can show an alert while the app is closed to the front', async () => {
    const front = await phone(undefined);
    const back = await phone(true);
    expect([...hub.backgroundClients()]).toStrictEqual([back.clientId]);
    expect(hub.backgroundClients().has(front.clientId)).toBe(false);
  });

  it('counts again once the same connection says the app is back in front', async () => {
    const first = await phone(true);
    expect(hub.connectedClients().size).toBe(0);
    const second = await phone(false);
    expect([...hub.connectedClients()]).toStrictEqual([second.clientId]);
    expect(hub.connectedClients().has(first.clientId)).toBe(false);
  });

  it('still receives what is delivered to its phone', async () => {
    const back = await phone(true);
    const reached = await hub.deliver(back.clientId, {
      type: 'notification',
      id: 'eventId=1',
      requestId: '3b9c1d52-7a40-4e1f-8c26-5d1e0f2a9b73',
      title: 'Doorbell',
      body: 'Someone is at the door',
      data: {},
    });
    expect(reached).toBe(1);
    await until(() => back.notices.includes('notification'), 'the notification to arrive');
  });

  it('is not reached by a notice only the open app can act on, so the hub wakes the phone by push instead', async () => {
    const back = await phone(true);
    const front = await phone(false);
    const speech = {
      type: 'ai_speech',
      id: 's1',
      from: 'Ai',
      text: 'Hello',
      audio: 'AA==',
    } as const;
    expect(await hub.deliver(back.clientId, speech, 'foreground')).toBe(0);
    expect(await hub.deliver(front.clientId, speech, 'foreground')).toBe(1);
    await until(() => front.notices.includes('ai_speech'), 'the speech to reach the open app');
    expect(back.notices).not.toContain('ai_speech');
  });
});
