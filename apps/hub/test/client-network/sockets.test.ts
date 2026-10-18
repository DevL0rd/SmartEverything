import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import type { NativeHubSocketEvent } from '@smarteverything/domain';
import { HubPolicies } from '../../src/client-network/policy';
import { HubSockets } from '../../src/client-network/sockets';
import {
  issueCertificate,
  listenPinned,
  newKey,
  newServerName,
  trustFor,
} from '../support/pinned-hub';

const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const owner = { id: 7, isDestroyed: (): boolean => false };
const LARGE = 'x'.repeat(1_500_000);

async function echoHub(): Promise<{
  readonly sockets: HubSockets<typeof owner>;
  readonly events: NativeHubSocketEvent[];
  readonly policies: HubPolicies;
  readonly certificate: Awaited<ReturnType<typeof issueCertificate>>;
  readonly port: number;
  readonly open: () => void;
}> {
  const certificate = await issueCertificate(newKey(), newServerName());
  const hub = await listenPinned(certificate, (_request, response) => {
    response.writeHead(404);
    response.end();
  });
  const wss = new WebSocketServer({ server: hub.server });
  wss.on('connection', (socket) => {
    socket.send(LARGE);
    socket.on('message', (data, binary) => {
      socket.send(data, { binary });
    });
  });
  closers.push(async () => {
    for (const client of wss.clients) client.terminate();
    wss.close();
    await hub.close();
  });
  const policies = new HubPolicies();
  closers.push(() => {
    policies.close();
  });
  const trust = trustFor(certificate, hub.port);
  policies.configure(trust);
  const events: NativeHubSocketEvent[] = [];
  const sockets = new HubSockets(policies, (_owner, event) => {
    events.push(event);
  });
  closers.push(() => {
    sockets.stop();
  });
  return {
    sockets,
    events,
    policies,
    certificate,
    port: hub.port,
    open: (): void => {
      sockets.open(owner, {
        scopeId: trust.scopeId,
        id: 'live',
        url: `wss://127.0.0.1:${String(hub.port)}/live`,
        protocols: [],
      });
    },
  };
}

describe('native hub sockets over the pinned route', () => {
  it('delivers a live message larger than 1 MiB', async () => {
    const hub = await echoHub();
    hub.open();
    await vi.waitFor(() => {
      expect(hub.events.some((event) => event.kind === 'message')).toBe(true);
    });
    const message = hub.events.find((event) => event.kind === 'message');
    expect(
      message?.kind === 'message' && typeof message.data === 'string' && message.data.length,
    ).toBe(LARGE.length);
  });

  it('sends a message larger than 1 MiB and gets it back', async () => {
    const hub = await echoHub();
    hub.open();
    await vi.waitFor(() => {
      expect(hub.events.some((event) => event.kind === 'open')).toBe(true);
    });
    hub.sockets.send(owner, { id: 'live', data: `${LARGE}!` });
    await vi.waitFor(() => {
      expect(
        hub.events.filter(
          (event) => event.kind === 'message' && event.data.length === LARGE.length + 1,
        ),
      ).toHaveLength(1);
    });
  });

  it('keeps an open socket alive when the same hub is configured with a longer inventory', async () => {
    const hub = await echoHub();
    hub.open();
    await vi.waitFor(() => {
      expect(hub.events.some((event) => event.kind === 'open')).toBe(true);
    });
    const longer = trustFor(hub.certificate, hub.port, 'scope-1', ['192.0.2.9']);
    expect(hub.policies.configure(longer)).toBe(false);
    hub.sockets.send(owner, { id: 'live', data: 'still here' });
    await vi.waitFor(() => {
      expect(
        hub.events.some((event) => event.kind === 'message' && event.data === 'still here'),
      ).toBe(true);
    });
    expect(hub.events.some((event) => event.kind === 'close')).toBe(false);
  });

  it('refuses a hub with another key during the TLS handshake', async () => {
    const hub = await echoHub();
    const other = await issueCertificate(newKey(), newServerName());
    hub.policies.configure(trustFor(other, hub.port));
    hub.open();
    await vi.waitFor(() => {
      expect(hub.events.some((event) => event.kind === 'close')).toBe(true);
    });
    expect(hub.events.some((event) => event.kind === 'open')).toBe(false);
  });
});
