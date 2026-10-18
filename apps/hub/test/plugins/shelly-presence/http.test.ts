import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { ShellyAuthenticationError, shellyPasswordHash } from '@smarteverything/shelly/rpc';
import { generate } from 'selfsigned';
import { afterEach, describe, expect, it } from 'vitest';
import {
  authenticatedShellyGet,
  readBounded,
  shellyHttp,
} from '../../../src/plugins/builtin/shelly-presence/http';

const ID = 'shellypresencegen4-aabbcc';
const NONCE = 'nonce-1';
const IP_NAME = 7;
const servers: Server[] = [];

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseDigest(header: string): Record<string, string> {
  return Object.fromEntries(
    [...header.slice(7).matchAll(/([a-z]+)=(?:"([^"]*)"|([^,\s]+))/gi)].map((match) => [
      match[1] ?? '',
      match[2] ?? match[3] ?? '',
    ]),
  );
}

async function listen(server: Server, protocol: 'http' | 'https', path = '/'): Promise<URL> {
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('not listening');
  return new URL(path, `${protocol}://127.0.0.1:${String(address.port)}`);
}

function options(password: string | null, url: URL): Parameters<typeof authenticatedShellyGet>[0] {
  return { address: url.origin, id: ID, password, signal: new AbortController().signal, tls: null };
}

function deviceWithPassword(password: string): Server {
  return createServer((request, response) => {
    const header = request.headers.authorization;
    if (header !== undefined) {
      const given = parseDigest(header);
      const expected = sha256(
        `${shellyPasswordHash(ID, password)}:${NONCE}:${given['nc'] ?? ''}:${given['cnonce'] ?? ''}:auth:${sha256(`GET:${request.url ?? ''}`)}`,
      );
      if (given['response'] === expected && given['realm'] === ID) {
        response.end('log text');
        return;
      }
    }
    response
      .writeHead(401, {
        'WWW-Authenticate': `Digest qop="auth", realm="${ID}", nonce="${NONCE}", algorithm=SHA-256`,
      })
      .end();
  });
}

afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
});

describe('Shelly HTTP', () => {
  it('answers the device digest challenge with the SHA-256 hash of the password', async () => {
    const url = await listen(deviceWithPassword('pw'), 'http', '/debug/log?n=5&f=0');
    const response = await authenticatedShellyGet(options('pw', url), url);
    expect(await readBounded(response, 100)).toBe('log text');
  });

  it('reports a wrong or missing password as an authentication failure', async () => {
    const url = await listen(deviceWithPassword('pw'), 'http', '/debug/log');
    await expect(authenticatedShellyGet(options('other', url), url)).rejects.toBeInstanceOf(
      ShellyAuthenticationError,
    );
    await expect(authenticatedShellyGet(options(null, url), url)).rejects.toBeInstanceOf(
      ShellyAuthenticationError,
    );
  });

  it('stops reading an answer that is larger than the limit', async () => {
    const url = await listen(
      createServer((_, response) => {
        response.end('x'.repeat(1000));
      }),
      'http',
    );
    const response = await shellyHttp(url, { signal: new AbortController().signal, tls: null });
    await expect(readBounded(response, 100)).rejects.toThrow('larger than 100 bytes');
  });

  it('trusts only the certificate authority the sensor was enrolled with', async () => {
    const identity = await generate([{ name: 'commonName', value: 'shelly' }], {
      algorithm: 'sha256',
      extensions: [{ name: 'subjectAltName', altNames: [{ type: IP_NAME, ip: '127.0.0.1' }] }],
    });
    const server = createSecureServer(
      { key: identity.private, cert: identity.cert },
      (_, response) => {
        response.end('secure');
      },
    );
    const url = await listen(server, 'https');
    const signal = new AbortController().signal;
    const trusted = { caPem: identity.cert, clientCertificate: null, clientKey: null };
    expect(await readBounded(await shellyHttp(url, { signal, tls: trusted }), 100)).toBe('secure');
    await expect(
      shellyHttp(url, { signal, tls: { caPem: null, clientCertificate: null, clientKey: null } }),
    ).rejects.toThrow();
  });
});
