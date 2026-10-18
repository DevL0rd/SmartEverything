import { randomUUID } from 'node:crypto';
import { createServer, request, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, createClientToken, hashClientToken } from '@smarteverything/domain';
import { GatewayPages } from '../../src/preview/gateway-pages';
import { harnessRig, type Rig } from '../assistant/harness/support/rig';
import type { HtmlPublication } from '../../src/preview/documents';
import { htmlPublication } from './support';

const DOMAIN = 'preview.test';
const APP = 'https://app.example';

let rig: Rig;
let server: Server;
let host: string;
let token: string;

beforeEach(async () => {
  rig = await harnessRig();
  token = createClientToken();
  rig.opened.store.clients.create(
    { name: 'Laptop browser', platform: 'web', role: 'owner', tokenHash: hashClientToken(token) },
    false,
  );
  const chat = rig.newChat({ kind: 'server' });
  const page = htmlPublication(rig, chat.id);
  host = `${page.view.id.replaceAll('-', '')}.${DOMAIN}`;
  const pages = new GatewayPages(rig.opened.store, {
    require: (): HtmlPublication => page,
    visible: (): HtmlPublication => page,
  });
  server = createServer((incoming, outgoing) => {
    pages
      .handle(incoming, outgoing, {
        host: incoming.headers.host ?? '',
        path: incoming.url ?? '/',
        domain: DOMAIN,
        ancestors: [APP],
      })
      .catch((cause: unknown) => {
        outgoing.writeHead(cause instanceof ApiError && cause.code === 'unauthorized' ? 401 : 500);
        outgoing.end();
      });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
});

afterEach(async () => {
  server.close();
  await rig.close();
});

function call(
  method: string,
  path: string,
  headers: Record<string, string>,
): Promise<{ readonly status: number; readonly cookie: string; readonly body: string }> {
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The test server is not listening.');
  const { port } = address;
  return new Promise((resolve, reject) => {
    const outgoing = request({ port, method, path, headers: { host, ...headers } }, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
      incoming.on('end', () => {
        resolve({
          status: incoming.statusCode ?? 0,
          cookie: incoming.headers['set-cookie']?.[0] ?? '',
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

async function session(bearer = token): Promise<string> {
  const response = await call('POST', '/.se-preview/session', {
    origin: APP,
    authorization: `Bearer ${bearer}`,
  });
  expect(response.status).toBe(204);
  return response.cookie.split(';')[0]?.split('=').slice(1).join('=') ?? '';
}

describe('a saved chat page reads with its own credential, never the hub token', () => {
  it('hands the page host a page-scoped credential that opens the page', async () => {
    const credential = await session();
    expect(credential).not.toContain(token);
    expect(credential).not.toBe('');
    const page = await call('GET', '/', { cookie: `__Host-se-pages=${credential}` });
    expect(page).toMatchObject({ status: 200, body: '<p>page</p>' });
  });

  it('refuses the hub bearer token and a tampered credential as the page cookie', async () => {
    const credential = await session();
    for (const cookie of [
      token,
      `${credential.slice(0, -1)}${credential.endsWith('0') ? '1' : '0'}`,
      `${randomUUID()}.deadbeef`,
    ]) {
      const page = await call('GET', '/', { cookie: `__Host-se-pages=${cookie}` });
      expect(page.status).toBe(401);
    }
  });

  it('refuses a credential minted for another page', async () => {
    const credential = await session();
    const other = `${randomUUID().replaceAll('-', '')}.${DOMAIN}`;
    host = other;
    const page = await call('GET', '/', { cookie: `__Host-se-pages=${credential}` });
    expect(page.status).not.toBe(200);
  });

  it('applies the home-only condition of the person to the page credential too', async () => {
    const { store } = rig.opened;
    const kid = store.profiles.create({ name: 'Kid' });
    store.personAccess.change(kid.id, { conditions: { home_only: true, schedule: null } });
    const memberToken = createClientToken();
    store.clients.create({
      name: 'Kid tablet',
      platform: 'web',
      role: 'member',
      tokenHash: hashClientToken(memberToken),
      profileId: kid.id,
    });
    const credential = await session(memberToken);
    const cookie = `__Host-se-pages=${credential}`;
    expect((await call('GET', '/', { cookie })).status).toBe(200);
    expect((await call('GET', '/', { cookie, 'cf-connecting-ip': '203.0.113.9' })).status).not.toBe(
      200,
    );
  });
});
