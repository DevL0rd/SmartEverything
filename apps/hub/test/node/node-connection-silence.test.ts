import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { NodeConnection } from '../../src/node/node-connection';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';

const PROTOCOL = 'silence-test';
const HEARTBEAT_MS = 30_000;

let hub: WebSocketServer;
let logs: CapturedLogs;
let connection: NodeConnection;
const served: WebSocket[] = [];
const opened: WebSocket[] = [];

beforeEach(async () => {
  logs = captureLogs();
  served.length = 0;
  opened.length = 0;
  hub = new WebSocketServer({
    port: 0,
    host: '127.0.0.1',
    handleProtocols: (protocols): string | false => (protocols.has(PROTOCOL) ? PROTOCOL : false),
  });
  hub.on('connection', (socket: WebSocket) => {
    served.push(socket);
  });
  await once(hub, 'listening');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
});

afterEach(() => {
  connection.stop();
  hub.close();
  vi.useRealTimers();
});

function connect(): void {
  const address = hub.address();
  if (address === null || typeof address !== 'object') throw new Error('expected a port');
  connection = new NodeConnection({
    hubUrl: `http://127.0.0.1:${String(address.port)}`,
    path: '/socket',
    protocol: PROTOCOL,
    token: 'token',
    log: testLogger('node'),
    failure: 'node.connection_failed',
    opened: (socket): void => {
      opened.push(socket);
      connection.welcomed();
    },
    message: (): void => undefined,
    closed: (): void => undefined,
  });
  connection.start();
}

async function reached(count: number): Promise<void> {
  await vi.waitFor(() => {
    expect(opened).toHaveLength(count);
    expect(served).toHaveLength(count);
  });
}

describe('a node connection to a hub that goes quiet', () => {
  it('closes the link and opens it again when the hub sends nothing for 2.5 heartbeats', async () => {
    connect();
    await reached(1);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2.5 - 1000);
    expect(logs.events()).not.toContain('node.hub_silent');
    await vi.advanceTimersByTimeAsync(2000);
    expect(logs.events()).toContain('node.hub_silent');
    await vi.advanceTimersByTimeAsync(1000);
    await reached(2);
  });

  it('keeps the link while the hub keeps pinging', async () => {
    connect();
    await reached(1);
    for (let beat = 0; beat < 6; beat++) {
      await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
      served[0]?.ping();
      await vi.waitFor(() => {
        expect(served[0]?.bufferedAmount).toBe(0);
      });
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
    expect(logs.events()).not.toContain('node.hub_silent');
    expect(opened).toHaveLength(1);
  });
});
