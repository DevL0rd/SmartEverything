import { once } from 'node:events';
import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openShellyRpc } from '../../../src/plugins/builtin/shelly-presence/connection';

const KEEPALIVE_MS = 30_000;

const servers: Server[] = [];
const held: Socket[] = [];

afterEach(() => {
  vi.useRealTimers();
  held.splice(0).forEach((socket) => socket.destroy());
  servers.splice(0).forEach((server) => server.close());
});

async function silentDevice(): Promise<string> {
  const server = createServer((socket) => {
    held.push(socket);
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return `http://127.0.0.1:${String(port)}`;
}

describe('keeping a Shelly link alive', () => {
  it('does not ping a device that has not finished the handshake', async () => {
    const address = await silentDevice();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const abort = new AbortController();
    const opened = openShellyRpc({
      address,
      id: 'shellyplus1-test',
      password: null,
      tls: null,
      signal: abort.signal,
    });
    const settled = opened.then(
      () => 'opened',
      (cause: unknown) => (cause instanceof Error ? cause.name : 'failed'),
    );
    await vi.waitFor(() => {
      expect(held).toHaveLength(1);
    });
    expect(() => vi.advanceTimersByTime(KEEPALIVE_MS * 2)).not.toThrow();
    abort.abort();
    expect(await settled).toBe('ShellyConnectionError');
  });
});
