import { createServer, type Server } from 'node:http';
import { API_ERROR } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { listenWhileStarting } from '../../src/service/starting-listener';
import { testLogger } from '../support/logs';

async function open(port: number): Promise<{ server: Server; port: number }> {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No TCP port.');
  return { server, port: address.port };
}

async function shut(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

describe('the listener that answers while the hub starts', () => {
  it('answers every request with a starting state, then frees the port', async () => {
    const free = await open(0);
    await shut(free.server);
    const starting = await listenWhileStarting(free.port, '127.0.0.1', testLogger('service'));
    const reply = await fetch(`http://127.0.0.1:${String(free.port)}/api/snapshot`);
    expect(reply.status).toBe(503);
    expect(reply.headers.get('retry-after')).toBe('2');
    expect(API_ERROR.parse(await reply.json()).error.code).toBe('hub_starting');
    await starting.close();
    await shut((await open(free.port)).server);
  });

  it('stays out of the way when the port is already taken', async () => {
    const taken = await open(0);
    const starting = await listenWhileStarting(taken.port, '127.0.0.1', testLogger('service'));
    await starting.close();
    await shut(taken.server);
  });
});
