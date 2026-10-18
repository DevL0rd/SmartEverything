import { once } from 'node:events';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { z } from 'zod';
import { HUB_MANIFEST, declaredVersion } from './contract-helpers';
import { repositoryFile } from './versions';

const VERSIONED = z.object({ version: z.string() });

function versionSeenFrom(manifest: string): string {
  return VERSIONED.parse(createRequire(repositoryFile(manifest))('ws/package.json')).version;
}

function portOf(server: WebSocketServer): number {
  return z.object({ port: z.number() }).parse(server.address()).port;
}

describe('ws contract', () => {
  it('is the same release these contracts exercise', () => {
    expect(versionSeenFrom('tooling/dependency-contracts/package.json')).toBe(
      declaredVersion(HUB_MANIFEST, 'ws'),
    );
  });

  it('sends the headers a client is given, which the Tuya message service authenticates with', async () => {
    const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await once(server, 'listening');
    const headers = new Promise<Readonly<Record<string, unknown>>>((resolve) => {
      server.on('connection', (socket, request) => {
        socket.send('hello');
        resolve(request.headers);
      });
    });
    const client = new WebSocket(`ws://127.0.0.1:${String(portOf(server))}/`, {
      headers: { username: 'access-id', password: 'derived' },
    });
    const received = new Promise<string>((resolve) => {
      client.on('message', (data) => {
        resolve(Buffer.isBuffer(data) ? data.toString('utf8') : '');
      });
    });
    expect(await headers).toMatchObject({ username: 'access-id', password: 'derived' });
    expect(await received).toBe('hello');
    client.close();
    server.close();
  });

  it('accepts rejectUnauthorized per connection, which the Samsung TV self-signed socket needs', () => {
    const client = new WebSocket('wss://127.0.0.1:9/', { rejectUnauthorized: false });
    client.on('error', () => undefined);
    expect(client.readyState).toBe(WebSocket.CONNECTING);
    client.terminate();
  });
});
