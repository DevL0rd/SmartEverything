import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { HubPolicies, HubTransportError } from '../../src/client-network/policy';
import { requestHub } from '../../src/client-network/request';
import { streamHubFetch } from '../../src/client-network/stream-fetch';
import { nextText } from '../support/stream';
import {
  issueCertificate,
  listenPinned,
  newKey,
  newServerName,
  trustFor,
  type HubCertificate,
  type PinnedHub,
} from '../support/pinned-hub';

const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

function reply(response: ServerResponse, body: string): void {
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end(body);
}
interface Fixture {
  readonly hub: PinnedHub;
  readonly policies: HubPolicies;
  readonly scopeId: string;
  readonly certificate: HubCertificate;
}
async function pinned(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  key = newKey(),
  serverName = newServerName(),
): Promise<Fixture> {
  const certificate = await issueCertificate(key, serverName);
  const hub = await listenPinned(certificate, handler);
  closers.push(hub.close);
  const policies = new HubPolicies();
  closers.push(() => {
    policies.close();
  });
  const trust = trustFor(certificate, hub.port);
  policies.configure(trust);
  return { hub, policies, scopeId: trust.scopeId, certificate };
}
function get(
  policies: HubPolicies,
  scopeId: string,
  url: string,
): Promise<{ status: number; body: string }> {
  return requestHub(policies, {
    scopeId,
    url,
    method: 'GET',
    headers: {},
    body: null,
  });
}

describe('pinned LAN transport', () => {
  it('answers over TLS when the certificate key is the paired key', async () => {
    const { hub, policies, scopeId } = await pinned((_request, response) => {
      reply(response, 'hello');
    });
    const answer = await get(policies, scopeId, `${hub.url}/ping`);
    expect(answer).toMatchObject({ status: 200, body: 'hello' });
  });

  it('refuses a hub whose certificate key is not the paired key', async () => {
    const impostor = await pinned((_request, response) => {
      reply(response, 'nope');
    });
    const genuine = await issueCertificate(newKey(), newServerName());
    impostor.policies.configure(trustFor(genuine, impostor.hub.port));
    await expect(
      get(impostor.policies, impostor.scopeId, `${impostor.hub.url}/ping`),
    ).rejects.toThrow(HubTransportError);
  });

  it('keeps working when the hub renews its certificate with the same key', async () => {
    const key = newKey();
    const serverName = newServerName();
    const first = await issueCertificate(key, serverName);
    const trust = trustFor(first, 1);
    const renewed = await issueCertificate(key, serverName, {
      from: Date.now() - 1000,
      to: Date.now() + 86_400_000,
    });
    const hub = await listenPinned(renewed, (_request, response) => {
      reply(response, 'renewed');
    });
    closers.push(hub.close);
    const policies = new HubPolicies();
    closers.push(() => {
      policies.close();
    });
    policies.configure(trustFor(first, hub.port));
    expect(trust.identity.tls.certificateSha256).not.toBe(
      trustFor(renewed, hub.port).identity.tls.certificateSha256,
    );
    const answer = await get(policies, trust.scopeId, `${hub.url}/ping`);
    expect(answer.body).toBe('renewed');
  });

  it('accepts a pinned key whose certificate dates are wrong', async () => {
    const certificate = await issueCertificate(newKey(), newServerName(), {
      from: Date.now() - 4 * 86_400_000,
      to: Date.now() - 2 * 86_400_000,
    });
    const hub = await listenPinned(certificate, (_request, response) => {
      reply(response, 'old');
    });
    closers.push(hub.close);
    const policies = new HubPolicies();
    closers.push(() => {
      policies.close();
    });
    const trust = trustFor(certificate, hub.port);
    policies.configure(trust);
    expect((await get(policies, trust.scopeId, `${hub.url}/ping`)).body).toBe('old');
  });

  it('reuses its TLS connections across consecutive requests', async () => {
    const { hub, policies, scopeId } = await pinned((_request, response) => {
      reply(response, 'again');
    });
    for (let index = 0; index < 6; index += 1) await get(policies, scopeId, `${hub.url}/ping`);
    expect(hub.connections()).toBeLessThanOrEqual(2);
  });

  it('lets a streaming answer finish when the same hub is configured with a longer inventory', async () => {
    const stream = await streaming();
    const longer = trustFor(stream.certificate, stream.hub.port, stream.scopeId, ['192.0.2.7']);
    expect(stream.policies.configure(longer)).toBe(false);
    stream.release();
    expect(await stream.rest()).toBe('second');
  });

  it('ends a streaming answer when the paired identity changes', async () => {
    const stream = await streaming();
    const other = await issueCertificate(newKey(), newServerName());
    expect(stream.policies.configure(trustFor(other, stream.hub.port, stream.scopeId))).toBe(true);
    await expect(stream.rest()).rejects.toThrow();
  });
});

async function streaming(): Promise<{
  readonly hub: PinnedHub;
  readonly policies: HubPolicies;
  readonly scopeId: string;
  readonly certificate: HubCertificate;
  readonly release: () => void;
  readonly rest: () => Promise<string>;
}> {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fixture = await pinned((_request, response) => {
    response.writeHead(200);
    response.write('first,');
    gate.then(
      () => {
        response.end('second');
      },
      (cause: unknown) => {
        throw cause;
      },
    );
  });
  const url = `${fixture.hub.url}/stream`;
  const response = await streamHubFetch(new Request(url), {
    ...fixture.policies.lease(fixture.scopeId, url),
    signal: new AbortController().signal,
  });
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('The streaming answer has no body');
  expect(await nextText(reader)).toBe('first,');
  return {
    ...fixture,
    release,
    rest: () => nextText(reader),
  };
}

describe('route-independent plain endpoints', () => {
  it('relays a loopback answer without any pinned agent', async () => {
    const server = createServer((_request, response) => {
      reply(response, 'loopback');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    closers.push(() => {
      server.closeAllConnections();
      server.close();
    });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    const response = await streamHubFetch(
      new Request(`http://127.0.0.1:${String(address.port)}/`),
      {
        url: new URL(`http://127.0.0.1:${String(address.port)}/`),
        signal: new AbortController().signal,
      },
    );
    expect(await response.text()).toBe('loopback');
  });
});
