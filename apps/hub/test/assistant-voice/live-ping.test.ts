import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { pingOf } from '../../src/assistant-voice/live-ping';

const servers: WebSocketServer[] = [];
const sockets: WebSocket[] = [];

async function socketTo(autoPong: boolean): Promise<WebSocket> {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1', autoPong });
  servers.push(server);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  const socket = new WebSocket(`ws://127.0.0.1:${String(port)}`);
  sockets.push(socket);
  await once(socket, 'open');
  return socket;
}

afterEach(async () => {
  for (const socket of sockets.splice(0)) {
    socket.terminate();
  }
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.close(resolve);
        }),
    ),
  );
});

describe('pingOf', () => {
  it('proves a Gemini session socket alive when the server answers a ping', async () => {
    const socket = await socketTo(true);
    await expect(pingOf({ conn: { ws: socket } })(1000)).resolves.toBe(true);
  });

  it('reports a socket whose server stopped answering as dead within the bound', async () => {
    const socket = await socketTo(false);
    const startedAt = Date.now();
    await expect(pingOf({ conn: { ws: socket } })(150)).resolves.toBe(false);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it('reports a closed socket and a session without a socket as dead', async () => {
    const socket = await socketTo(true);
    socket.close();
    await expect(pingOf({ conn: { ws: socket } })(1000)).resolves.toBe(false);
    await expect(pingOf({ conn: {} })(1000)).resolves.toBe(false);
  });
});
