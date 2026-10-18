import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { X509Certificate, createHash, randomUUID } from 'node:crypto';
import { NODE_CONNECTION_PATH, NODE_CONNECTION_RESPONSE } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeRouteStore } from '../../src/client-network/route-store';
import { pairNode } from '../../src/node/setup';
import { NODE_SERVICE_CONFIG } from '../../src/service/configuration';
import {
  issueCertificate,
  listenPinned,
  newKey,
  newServerName,
  trustFor,
  type PinnedHub,
} from '../support/pinned-hub';
import { temporaryDirectory } from '../support/server';

const TOKEN = `sen_${'a'.repeat(43)}`;
const WINDOW_TOKEN = `set_${'b'.repeat(64)}`;
const CODE = 'ABCD-EFGH';

let node: { path: string; remove: () => Promise<void> };
let hub: PinnedHub;
let pin: string;

beforeEach(async () => {
  node = await temporaryDirectory();
  const certificate = await issueCertificate(newKey(), newServerName());
  pin = createHash('sha256')
    .update(new X509Certificate(certificate.cert).publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex');
  const deviceId = randomUUID();
  let url = '';
  hub = await listenPinned(certificate, (request, response) => {
    const answer =
      request.url === NODE_CONNECTION_PATH
        ? NODE_CONNECTION_RESPONSE.parse({
            device_id: deviceId,
            connection: {
              identity: trustFor(certificate, hub.port).identity,
              endpoints: [{ kind: 'lan', url }],
              remoteAvailable: false,
              discovery: { state: 'disabled', detail: 'Discovery is disabled.' },
            },
          })
        : { token: TOKEN, device_id: deviceId, hub_url: url, window_token: WINDOW_TOKEN };
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(answer));
  });
  url = hub.url;
});

afterEach(async () => {
  await hub.close();
  await node.remove();
});

async function exists(name: string): Promise<boolean> {
  return access(join(node.path, name)).then(
    () => true,
    () => false,
  );
}

describe('pairing a computer with a self-signed hub', () => {
  it('claims through the pinned certificate and keeps the pinned route for the service', async () => {
    await pairNode({ dataDirectory: node.path, hubUrl: hub.url, code: CODE, pin });

    const { node: paired } = NODE_SERVICE_CONFIG.parse(
      JSON.parse(await readFile(join(node.path, 'service.json'), 'utf8')),
    );
    expect(paired.node_token).toBe(TOKEN);
    expect(JSON.parse(await readFile(join(node.path, 'node-window.json'), 'utf8'))).toEqual({
      hub_url: hub.url,
      token: WINDOW_TOKEN,
    });
    const route = await new NodeRouteStore(node.path, TOKEN).read();
    expect(route?.trust.identity.id).toBe(pin);
    expect(route?.trust.endpoints).toEqual([{ kind: 'lan', url: hub.url }]);
  });

  it('refuses a hub whose certificate is not the pinned one and writes nothing', async () => {
    await expect(
      pairNode({ dataDirectory: node.path, hubUrl: hub.url, code: CODE, pin: 'f'.repeat(64) }),
    ).rejects.toMatchObject({ cause: { name: 'HubPinMismatchError' } });

    expect(await exists('service.json')).toBe(false);
    expect(await exists('node-window.json')).toBe(false);
  });

  it('refuses a self-signed hub when no pin is given', async () => {
    await expect(
      pairNode({ dataDirectory: node.path, hubUrl: hub.url, code: CODE }),
    ).rejects.toMatchObject({ cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' } });

    expect(await exists('service.json')).toBe(false);
  });

  it('refuses a plain-HTTP hub on the network before contacting it', async () => {
    await expect(
      pairNode({ dataDirectory: node.path, hubUrl: 'http://192.168.1.5:7880', code: CODE }),
    ).rejects.toMatchObject({ detail: 'A remote node hub requires HTTPS' });

    expect(await exists('service.json')).toBe(false);
  });
});
