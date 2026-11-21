import {
  LIVE_PROTOCOL_MISMATCH,
  LIVE_PROTOCOL_PREFIX,
  createClientToken,
  hashClientToken,
  liveProtocols,
} from '@smarteverything/domain';
import type { HubStatus } from '@smarteverything/domain';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import WebSocket from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LiveHub } from '../src/server/live';
import { testLogger } from './support/logs';
import { refusingUpgrades } from './support/socket-client';
import { testStore, type TestStore } from './support/store';

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

function memberToken(): string {
  const token = createClientToken();
  test.store.clients.create({
    name: 'Phone',
    platform: 'android',
    role: 'member',
    tokenHash: hashClientToken(token),
  });
  return token;
}

describe('a live socket opened with another live protocol version', () => {
  it('is closed with the protocol mismatch code and reason', async () => {
    const [, bearer] = liveProtocols(memberToken());
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/live`, [
      `${LIVE_PROTOCOL_PREFIX}v1`,
      bearer,
    ]);
    sockets.push(socket);
    const closed = await new Promise<{ code: number; reason: string }>((resolve) => {
      socket.on('close', (code: number, reason: Buffer) => {
        resolve({ code, reason: reason.toString('utf8') });
      });
    });
    expect(closed).toStrictEqual({
      code: LIVE_PROTOCOL_MISMATCH.code,
      reason: LIVE_PROTOCOL_MISMATCH.reason,
    });
    expect(socket.protocol).toBe(`${LIVE_PROTOCOL_PREFIX}v1`);
  });

  it('still opens with the current protocol', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/live`, [
      ...liveProtocols(memberToken()),
    ]);
    sockets.push(socket);
    await once(socket, 'open');
    expect(socket.readyState).toBe(WebSocket.OPEN);
  });
});
