import { createHash, randomBytes, X509Certificate } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type Server } from 'node:https';
import { createServer as createSilentServer, type Server as SilentServer } from 'node:net';
import { generate } from 'selfsigned';
import { afterEach, describe, expect, it } from 'vitest';
import { NATIVE_HUB_TRUST } from '@smarteverything/domain';
import { DesktopPairingEnrollments } from '../src/hub-network/pairing-enrollment';
import { HubPairingInspections } from '../src/hub-network/pairing-inspection';

const DAY_MS = 86_400_000;

interface Hub {
  readonly server: Server;
  readonly port: number;
  readonly serverName: string;
  readonly certificateSha256: string;
  readonly publicKeySha256: string;
}

const hubs: (Server | SilentServer)[] = [];

afterEach(async () => {
  for (const server of hubs.splice(0)) {
    if ('closeAllConnections' in server) server.closeAllConnections();
    server.close();
    await once(server, 'close');
  }
});

async function listenSilent(): Promise<number> {
  const server = createSilentServer();
  hubs.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return portOf(server);
}

function portOf(server: Server | SilentServer): number {
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('The fixture has no port');
  return address.port;
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function listen(handler: Parameters<typeof createServer>[1] = () => undefined): Promise<Hub> {
  const serverName = `smarteverything-${randomBytes(16).toString('hex')}.local`;
  const pair = await generate([{ name: 'commonName', value: serverName }], {
    keySize: 2048,
    algorithm: 'sha256',
    notBeforeDate: new Date(Date.now() - DAY_MS),
    notAfterDate: new Date(Date.now() + DAY_MS),
    extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: serverName }] }],
  });
  const server = createServer({ key: pair.private, cert: pair.cert }, handler);
  hubs.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const x509 = new X509Certificate(pair.cert);
  return {
    server,
    port: portOf(server),
    serverName,
    certificateSha256: digest(x509.raw),
    publicKeySha256: digest(x509.publicKey.export({ type: 'spki', format: 'der' })),
  };
}

function inspection(hub: Hub): { requestId: string; generation: number; url: string } {
  return { requestId: 'request-1', generation: 3, url: `https://127.0.0.1:${String(hub.port)}` };
}

function trustFor(hub: Hub, publicKeySha256 = hub.publicKeySha256): unknown {
  return NATIVE_HUB_TRUST.parse({
    scopeId: 'pairing:one',
    identity: {
      id: publicKeySha256,
      protocolVersion: 1,
      name: 'Home',
      tls: {
        serverName: hub.serverName,
        certificateSha256: hub.certificateSha256,
        publicKeySha256,
      },
    },
    endpoints: [{ kind: 'lan', url: `https://127.0.0.1:${String(hub.port)}` }],
    lanAddresses: ['127.0.0.1'],
  });
}

describe('inspecting a home found on the network', () => {
  it('reads the certificate identity of the chosen candidate', async () => {
    const hub = await listen();
    const observed = await new HubPairingInspections<string>().inspect('window', inspection(hub));
    expect(observed.tls).toEqual({
      serverName: hub.serverName,
      certificateSha256: hub.certificateSha256,
      publicKeySha256: hub.publicKeySha256,
    });
  });

  it('cancels a running inspection without remembering a cancel that arrives early', async () => {
    const port = await listenSilent();
    const input = {
      requestId: 'request-1',
      generation: 3,
      url: `https://127.0.0.1:${String(port)}`,
    };
    const inspections = new HubPairingInspections<string>();
    inspections.cancel('window', 'request-1');
    const running = inspections.inspect('window', input);
    inspections.cancel('window', 'request-1');
    await expect(running).rejects.toThrow('cancelled');
    const next = inspections.inspect('window', input);
    inspections.close();
    await expect(next).rejects.toThrow('cancelled');
  });
});

describe('talking to a home while pairing', () => {
  const reply = (_request: unknown, response: { end: (body: string) => void }): void => {
    response.end('{}');
  };

  it('sends the code and the new token through the pinned endpoint', async () => {
    const hub = await listen(reply);
    const enrollments = new DesktopPairingEnrollments<string>();
    enrollments.configure('window', trustFor(hub));
    const answer = await enrollments.request('window', {
      scopeId: 'pairing:one',
      url: `https://127.0.0.1:${String(hub.port)}/api/pair/proof`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"nonce":"x"}',
    });
    expect(answer).toMatchObject({ status: 200, body: '{}' });
    enrollments.close();
  });

  it('refuses a home whose certificate key is not the one that was inspected', async () => {
    const hub = await listen(reply);
    const enrollments = new DesktopPairingEnrollments<string>();
    enrollments.configure('window', trustFor(hub, 'ef'.repeat(32)));
    await expect(
      enrollments.request('window', {
        scopeId: 'pairing:one',
        url: `https://127.0.0.1:${String(hub.port)}/api/pair/claim`,
        method: 'GET',
        headers: {},
        body: null,
      }),
    ).rejects.toThrow();
    enrollments.close();
  });

  it('refuses another window and any other endpoint', async () => {
    const hub = await listen(reply);
    const enrollments = new DesktopPairingEnrollments<string>();
    enrollments.configure('window', trustFor(hub));
    const request = (url: string, owner: string): Promise<unknown> =>
      enrollments.request(owner, {
        scopeId: 'pairing:one',
        url,
        method: 'GET',
        headers: {},
        body: null,
      });
    await expect(request(`https://127.0.0.1:${String(hub.port)}/`, 'other')).rejects.toThrow(
      'another owner',
    );
    await expect(request('https://127.0.0.2:9/', 'window')).rejects.toThrow('inspected');
    enrollments.close();
  });
});
