import { once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { answersPing } from '../../src/server/live-reach';

const PROBE_MS = 200;

const servers: WebSocketServer[] = [];
const clients: WebSocket[] = [];

afterEach(() => {
  clients.splice(0).forEach((client) => {
    client.terminate();
  });
  servers.splice(0).forEach((server) => {
    server.close();
  });
});

async function pair(
  autoPong: boolean,
): Promise<{ readonly hub: WebSocket; readonly app: WebSocket }> {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  servers.push(server);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  const arrived = once(server, 'connection');
  const app = new WebSocket(`ws://127.0.0.1:${String(port)}`, { autoPong });
  clients.push(app);
  const [accepted] = await Promise.all([arrived, once(app, 'open')]);
  const hub: unknown = accepted[0];
  if (!(hub instanceof WebSocket)) {
    throw new Error('the hub side of the connection is not a WebSocket');
  }
  return { hub, app };
}

describe('asking whether a live connection still answers', () => {
  it('says yes for a connection that answers a ping', async () => {
    const { hub } = await pair(true);
    expect(await answersPing(hub, PROBE_MS)).toBe(true);
  });

  it('says no, and drops the connection, when the ping is not answered in time', async () => {
    const { hub } = await pair(false);
    const closed = once(hub, 'close');
    expect(await answersPing(hub, PROBE_MS)).toBe(false);
    await closed;
  });

  it('says no for a connection that is already closed', async () => {
    const { hub, app } = await pair(true);
    app.close();
    await once(hub, 'close');
    expect(await answersPing(hub, PROBE_MS)).toBe(false);
  });
});
