import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  BEARER_PROTOCOL_PREFIX,
  createClientToken,
  hashClientToken,
} from '@smarteverything/domain';
import WebSocket, { type RawData } from 'ws';
import { z } from 'zod';
import { httpFailureOf } from '../../src/server/errors';
import { refuseUpgrade } from '../../src/server/upgrade-refusal';
import type { TestStore } from './store';

const MESSAGE = z.record(z.string(), z.unknown());

export interface SocketLink {
  readonly socket: WebSocket;
  readonly messages: Record<string, unknown>[];
  readonly frames: Buffer[];
}

export interface SocketBench {
  readonly connect: (token: string) => Promise<SocketLink>;
  readonly refused: () => Promise<Error>;
  readonly stop: () => void;
}

export interface TestClient {
  readonly id: string;
  readonly token: string;
}

type Upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => Promise<void>;

function bytesOf(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  return Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
}

export function addClient(test: TestStore, name: string, role: 'owner' | 'member'): TestClient {
  const token = createClientToken();
  const row = test.store.clients.create(
    { name, platform: 'android', role, tokenHash: hashClientToken(token) },
    role === 'owner',
  );
  return { id: row.id, token };
}

export function refusingUpgrades(
  upgrade: Upgrade,
): (request: IncomingMessage, socket: Duplex, head: Buffer) => void {
  return (request, socket, head) => {
    upgrade(request, socket, head).catch((cause: unknown) => {
      const failure = httpFailureOf(cause);
      refuseUpgrade(socket, failure.error);
      if (failure.unexpected !== null) {
        throw cause;
      }
    });
  };
}

async function listen(upgrade: Upgrade): Promise<{ server: Server; url: string }> {
  const server = createServer();
  server.on('upgrade', refusingUpgrades(upgrade));
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The test server did not get a TCP port.');
  }
  return { server, url: `ws://127.0.0.1:${String(address.port)}` };
}

function collect(socket: WebSocket): SocketLink {
  const link: SocketLink = { socket, messages: [], frames: [] };
  socket.on('message', (data, binary) => {
    if (binary) {
      link.frames.push(bytesOf(data));
      return;
    }
    const parsed: unknown = JSON.parse(bytesOf(data).toString('utf8'));
    link.messages.push(MESSAGE.parse(parsed));
  });
  return link;
}

export async function serveSockets(protocol: string, upgrade: Upgrade): Promise<SocketBench> {
  const { server, url } = await listen(upgrade);
  const sockets: WebSocket[] = [];
  return {
    connect: async (token): Promise<SocketLink> => {
      const socket = new WebSocket(url, [protocol, `${BEARER_PROTOCOL_PREFIX}${token}`]);
      sockets.push(socket);
      const link = collect(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      });
      return link;
    },
    refused: (): Promise<Error> => {
      const socket = new WebSocket(url, [protocol]);
      sockets.push(socket);
      return new Promise<Error>((resolve) => {
        socket.once('error', resolve);
      });
    },
    stop: (): void => {
      sockets.forEach((socket) => {
        socket.terminate();
      });
      server.close();
    },
  };
}
