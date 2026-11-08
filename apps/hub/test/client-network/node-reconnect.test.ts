import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { HUB_IDENTITY_PATH, NATIVE_HUB_ROUTE_CONFIGURATION } from '@smarteverything/domain';
import { NodeConnection } from '../../src/node/node-connection';
import { NodeRouteAuthority } from '../../src/client-network/route-authority';
import { nodeHubTransport } from '../../src/client-network/node-transport';
import { NodeRouteStore } from '../../src/client-network/route-store';
import type { NetworkEventBus } from '../../src/client-network/route-events';
import {
  issueCertificate,
  listenPinned,
  newKey,
  newServerName,
  trustFor,
} from '../support/pinned-hub';
import { MemoryNetwork } from '../support/memory-mdns';
import { testLogger } from '../support/logs';

const DEVICE = '0f1d2c3b-4a59-4687-8d9a-0b1c2d3e4f50';
const TOKEN = 'node-token';
const CANONICAL = 'https://127.0.0.3:1';
const closers: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
});

function networkBus(): NetworkEventBus {
  return {
    call: () => Promise.resolve(['/fake']),
    watch: () => Promise.resolve(() => undefined),
    onError: () => undefined,
    close: () => undefined,
  };
}

async function fixture(): Promise<{
  readonly authority: NodeRouteAuthority;
  readonly connection: NodeConnection;
  readonly outage: () => void;
  readonly restore: () => void;
  readonly opened: () => number;
}> {
  const certificate = await issueCertificate(newKey(), newServerName());
  let healthy = true;
  const hub = await listenPinned(certificate, (request, response) => {
    response.writeHead(healthy ? 200 : 503);
    response.end(
      request.url === HUB_IDENTITY_PATH
        ? JSON.stringify({
            service: 'smarteverything',
            identity: trustFor(certificate, 1).identity,
          })
        : '',
    );
  });
  closers.push(hub.close);
  const sockets = new WebSocketServer({ server: hub.server });
  closers.push(() => {
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
  });
  const configuration = NATIVE_HUB_ROUTE_CONFIGURATION.parse({
    canonicalOrigin: CANONICAL,
    trust: trustFor(certificate, hub.port, `node:${DEVICE}`),
    bindings: [
      {
        scopeId: `node:${DEVICE}`,
        canonicalOrigin: CANONICAL,
        hubId: trustFor(certificate, hub.port).identity.id,
        principalId: DEVICE,
        credentialKind: 'node',
        credentialGeneration: 0,
      },
    ],
  });
  const directory = await mkdtemp(join(tmpdir(), 'node-reconnect-'));
  closers.push(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'node-route.json');
  await new NodeRouteStore(file, TOKEN).write(configuration);
  const authority = new NodeRouteAuthority({
    hubUrl: CANONICAL,
    deviceId: DEVICE,
    token: TOKEN,
    directory: file,
    log: testLogger('node-route'),
    bus: networkBus,
    mdns: new MemoryNetwork().host('192.0.2.2'),
  });
  closers.push(() => authority.stop());
  await authority.start();
  let opened = 0;
  const connection = new NodeConnection({
    hubUrl: CANONICAL,
    path: '/socket',
    protocol: 'route-test',
    token: TOKEN,
    transport: nodeHubTransport(authority, CANONICAL),
    log: testLogger('node'),
    failure: 'node.connection_failed',
    opened: (): void => {
      opened += 1;
      connection.welcomed();
      connection.healthy();
    },
    message: (): void => undefined,
    closed: (): void => undefined,
  });
  closers.push(() => {
    connection.stop();
  });
  return {
    authority,
    connection,
    opened: () => opened,
    outage: (): void => {
      healthy = false;
      for (const socket of sockets.clients) socket.terminate();
    },
    restore: (): void => {
      healthy = true;
    },
  };
}

it('recovers a Computer socket when all enrolled routes fail and the same Hub returns without network or discovery events', async () => {
  const computer = await fixture();
  computer.connection.start();
  await vi.waitFor(() => {
    expect(computer.opened()).toBe(1);
  });
  computer.outage();
  await vi.waitFor(() => {
    expect(computer.authority.state.endpoint).toBeNull();
  });
  computer.restore();
  await vi.waitFor(
    () => {
      expect(computer.opened()).toBe(2);
    },
    { timeout: 5000 },
  );
  expect(computer.authority.state.endpoint?.kind).toBe('lan');
});
