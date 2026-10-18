import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HubPreviewOpen } from '@smarteverything/domain';
import { NativePreviewRelay } from '../../src/preview/native-relay';
import { testLogger } from '../support/logs';

let workspace: string;
let relay: NativePreviewRelay;
let service: Server | undefined;

beforeEach(async () => {
  workspace = await realpath(await mkdtemp(join(tmpdir(), 'relay-')));
  relay = new NativePreviewRelay('http://127.0.0.1:1', 'token', testLogger('relay'));
});

afterEach(async () => {
  relay.stop();
  service?.close();
  service = undefined;
  await rm(workspace, { recursive: true, force: true });
});

function listen(port: number): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      socket.on('error', () => undefined);
    });
    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

async function freePort(): Promise<number> {
  const server = await listen(0);
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (address === null || typeof address === 'string') throw new Error('No port was bound.');
  return address.port;
}

function frame(handle: string): HubPreviewOpen {
  return {
    type: 'preview_open',
    device_id: randomUUID(),
    generation: randomUUID(),
    runtime_instance: randomUUID(),
    stream_id: randomUUID(),
    ticket: 'a'.repeat(64),
    publication_id: randomUUID(),
    revision: randomUUID(),
    service_handle: handle,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
}

describe('a shared development service keeps working across restarts', () => {
  it('shares a service that is not running yet and reports it offline until it starts', async () => {
    const port = await freePort();
    const handle = await relay.publish(randomUUID(), workspace, {
      title: 'App',
      origin: `http://127.0.0.1:${String(port)}`,
      initial_path: '/',
      service_scope: 'authorized_workspace_service',
    });
    await expect(relay.open(frame(handle))).rejects.toThrow('offline');
    service = await listen(port);
    const connected = new Promise((resolve) => service?.once('connection', resolve));
    await relay.open(frame(handle));
    await connected;
  });

  it('reaches the restarted service without sharing it again', async () => {
    const port = await freePort();
    const handle = await relay.publish(randomUUID(), workspace, {
      title: 'App',
      origin: `http://127.0.0.1:${String(port)}`,
      initial_path: '/',
      service_scope: 'authorized_workspace_service',
    });
    for (let restart = 0; restart < 2; restart += 1) {
      service = await listen(port);
      const connected = new Promise((resolve) => service?.once('connection', resolve));
      await relay.open(frame(handle));
      await connected;
      await new Promise((resolve) => service?.close(resolve));
      service = undefined;
    }
  });

  it('refuses the hub API port', async () => {
    await expect(
      relay.publish(randomUUID(), workspace, {
        title: 'Hub',
        origin: 'http://127.0.0.1:1',
        initial_path: '/',
        service_scope: 'authorized_workspace_service',
      }),
    ).rejects.toThrow('hub API');
  });
});
