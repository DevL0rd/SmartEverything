import { randomUUID } from 'node:crypto';
import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http';
import { connect } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import {
  NODE_PREVIEW_PROTOCOL,
  type AiPreviewPublication,
  type ComputerNodeRow,
  type HubPreviewOpen,
} from '@smarteverything/domain';
import { ComputerNodeAccess } from '../../src/computers/node-access';
import { PreviewDataSockets } from '../../src/preview/data-sockets';
import { PreviewGateway } from '../../src/preview/gateway';
import { PreviewLeases, PREVIEW_COOKIE } from '../../src/preview/leases';
import type { Publication } from '../../src/preview/publications';
import { harnessRig, type Rig } from '../assistant/harness/support/rig';
import { testLogger } from '../support/logs';

const DOMAIN = 'preview.test';
const APP = 'https://app.example';

class FixedAccess extends ComputerNodeAccess {
  constructor(
    rig: Rig,
    private readonly deviceId: string,
  ) {
    super(rig.opened.store, () => new Date());
  }
  override authenticate(): ComputerNodeRow {
    return {
      device_id: this.deviceId,
      machine_id: 'a'.repeat(32),
      hub_url: 'https://hub.example',
      paired_at: new Date().toISOString(),
      revoked_at: null,
    };
  }
}

interface Reply {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

let rig: Rig;
let dev: Server;
let devPort: number;
let devConnections: number;
let hubSocket: Server;
let gateway: PreviewGateway;
let leases: PreviewLeases;
let data: PreviewDataSockets;
let gatewayPort: number;
let host: string;
let credential: string;
let seen: IncomingHttpHeaders;

function portOf(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The test server is not listening.');
  return address.port;
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function startDevService(): Promise<void> {
  dev = createServer((req, res) => {
    seen = req.headers;
    if (req.url === '/go') {
      res.writeHead(302, { location: `http://127.0.0.1:${String(devPort)}/target` });
      res.end();
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/plain',
      ...(req.url === '/nopolicy' ? {} : { 'content-security-policy': "default-src 'none'" }),
      'set-cookie': 'session=1; Domain=127.0.0.1; Path=/',
    });
    res.end(`served ${req.url ?? ''}`);
  });
  dev.on('connection', () => {
    devConnections += 1;
  });
  const sockets = new WebSocketServer({ server: dev });
  sockets.on('connection', (ws) => {
    ws.on('message', (raw, binary) => {
      ws.send(raw, { binary });
    });
  });
  return listen(dev).then(() => {
    devPort = portOf(dev);
  });
}

function openRelay(frame: HubPreviewOpen, deviceId: string): void {
  const ws = new WebSocket(`ws://127.0.0.1:${String(portOf(hubSocket))}/`, NODE_PREVIEW_PROTOCOL, {
    perMessageDeflate: false,
    headers: { authorization: 'Bearer node' },
  });
  const tcp = connect(devPort, '127.0.0.1');
  ws.on('open', () => {
    ws.send(
      JSON.stringify({
        type: 'preview_connect',
        device_id: deviceId,
        generation: frame.generation,
        runtime_instance: frame.runtime_instance,
        stream_id: frame.stream_id,
        ticket: frame.ticket,
      }),
    );
  });
  ws.on('message', (chunk, binary) => {
    if (binary && Buffer.isBuffer(chunk)) tcp.write(chunk);
  });
  tcp.on('data', (chunk) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
  });
  tcp.on('close', () => {
    ws.terminate();
  });
  ws.on('close', () => tcp.destroy());
  ws.on('error', () => tcp.destroy());
  tcp.on('error', () => {
    ws.terminate();
  });
}

function publication(): Publication {
  const deviceId = randomUUID();
  const chat = rig.newChat({ kind: 'server' });
  const view: AiPreviewPublication = {
    id: randomUUID(),
    revision: randomUUID(),
    chat_id: chat.id,
    profile_id: rig.owner.profileId,
    target: { kind: 'device', device_id: deviceId },
    generation: randomUUID(),
    runtime_instance: randomUUID(),
    workspace: '/work',
    title: 'Dev',
    source_origin: `http://127.0.0.1:${String(devPort)}`,
    initial_path: '/',
    expires_at: null,
  };
  return {
    view,
    session: 'session',
    serviceHandle: randomUUID(),
    writerExpires: (): number => Date.now() + 60_000,
    send: (frame): void => {
      openRelay(frame, deviceId);
    },
  };
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await listen(probe);
  const port = portOf(probe);
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

beforeEach(async () => {
  rig = await harnessRig();
  devConnections = 0;
  await startDevService();
  const published = publication();
  leases = new PreviewLeases(rig.opened.store, {
    require: (): Publication => published,
    onRevoke: (): (() => void) => (): void => undefined,
  });
  data = new PreviewDataSockets(
    new FixedAccess(rig, published.view.target.device_id),
    testLogger('data-sockets'),
  );
  hubSocket = createServer();
  hubSocket.on('upgrade', (req, socket, head) => {
    data.upgrade(req, socket, head);
  });
  await listen(hubSocket);
  const caller = { kind: 'client' as const, client: rig.opened.store.clients.byId(rig.clientId) };
  const issued = leases.issue(caller, published, DOMAIN);
  leases.own(caller, published.view.chat_id, issued, () => undefined);
  host = new URL(issued.origin).host;
  credential = leases.bootstrap(
    host,
    new URL(issued.url).searchParams.get('code') ?? '',
  ).credential;
  gatewayPort = await freePort();
  gateway = new PreviewGateway(
    { base_domain: DOMAIN, port: gatewayPort, frame_origins: [APP] },
    leases,
    data,
    testLogger('gateway'),
  );
  await gateway.start();
});

afterEach(async () => {
  await gateway.stop();
  hubSocket.close();
  dev.closeAllConnections();
  dev.close();
  await rig.close();
});

function get(path: string, headers: Record<string, string> = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        port: gatewayPort,
        host: '127.0.0.1',
        path,
        agent: false,
        headers: { host, cookie: `${PREVIEW_COOKIE}=${credential}`, ...headers },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf8');
        });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('the preview gateway relays a shared service', () => {
  it('keeps the service own content security policy and only adds the frame ancestors', async () => {
    const reply = await get('/page');
    expect(reply.body).toBe('served /page');
    const policy = String(reply.headers['content-security-policy']);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain(`frame-ancestors ${APP}`);
    expect(policy).not.toContain('script-src');
  });

  it('adds only the frame ancestors when the service sends no policy', async () => {
    const reply = await get('/nopolicy');
    expect(reply.headers['content-security-policy']).toBe(`frame-ancestors ${APP}`);
  });

  it('sends the service its own origin and no preview credential', async () => {
    await get('/who', {
      origin: `https://${host}`,
      cookie: `${PREVIEW_COOKIE}=${credential}; theme=dark`,
    });
    expect(seen.origin).toBe(`http://127.0.0.1:${String(devPort)}`);
    expect(seen.cookie).toBe('theme=dark');
    expect(seen.host).toBe(`127.0.0.1:${String(devPort)}`);
  });

  it('rewrites redirects to the preview origin and drops cookie domains', async () => {
    const redirect = await get('/go');
    expect(redirect.status).toBe(302);
    expect(redirect.headers.location).toBe(`https://${host}/target`);
    const page = await get('/page');
    expect(String(page.headers['set-cookie'])).toBe('session=1; Path=/');
  });

  it('reuses one relay stream for sequential requests', async () => {
    for (let index = 0; index < 5; index += 1) await get(`/n${String(index)}`);
    expect(devConnections).toBe(1);
  });

  it('serves more parallel requests than the old stream cap allowed', async () => {
    const replies = await Promise.all(
      Array.from({ length: 40 }, (_, index) => get(`/p${String(index)}`)),
    );
    expect(replies.every((reply) => reply.status === 200)).toBe(true);
  });

  it('upgrades websockets through the relay', async () => {
    const echoed = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${String(gatewayPort)}/socket`, {
        headers: { host, cookie: `${PREVIEW_COOKIE}=${credential}`, origin: `https://${host}` },
      });
      ws.on('open', () => {
        ws.send('ping');
      });
      ws.on('message', (raw) => {
        resolve(Buffer.isBuffer(raw) ? raw.toString('utf8') : '');
        ws.close();
      });
      ws.on('error', reject);
    });
    expect(echoed).toBe('ping');
  });
});

describe('the isolated preview origin stays the boundary', () => {
  it('refuses a request without the lease cookie', async () => {
    const reply = await get('/page', { cookie: 'other=1' });
    expect(reply.status).toBe(401);
  });

  it('refuses another origin', async () => {
    const reply = await get('/page', { origin: 'https://evil.example' });
    expect(reply.status).toBe(403);
  });

  it('refuses a websocket from another origin', async () => {
    const status = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${String(gatewayPort)}/socket`, {
        headers: {
          host,
          cookie: `${PREVIEW_COOKIE}=${credential}`,
          origin: 'https://evil.example',
        },
      });
      ws.on('open', () => {
        resolve(101);
      });
      ws.on('error', () => {
        resolve(0);
      });
      ws.on('unexpected-response', (_req, res) => {
        resolve(res.statusCode ?? 0);
      });
    });
    expect(status).not.toBe(101);
  });
});
