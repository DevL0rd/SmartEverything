import { once } from 'node:events';
import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startDavProxy, type DavProxy } from '../../src/drive-mount/dav-proxy.js';

const TOKEN = 'device-token-for-test';
const ROOT = 'root1';
const HUB_PREFIX = `/dav/${ROOT}/`;

interface Seen {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

type Answer = (seen: Seen) => {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
};

interface Stack {
  readonly hub: Server;
  readonly seen: Seen[];
  readonly proxy: DavProxy;
  readonly sessionUrl: string;
  readonly reply: (answer: Answer) => void;
}

const stacks: Stack[] = [];

async function startStack(): Promise<Stack> {
  const seen: Seen[] = [];
  let answer: Answer = () => ({ status: 204 });
  const hub = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const entry: Seen = {
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      };
      seen.push(entry);
      const reply = answer(entry);
      const body = reply.body ?? '';
      res.writeHead(reply.status, { 'content-length': Buffer.byteLength(body), ...reply.headers });
      res.end(body);
    });
  });
  hub.listen(0, '127.0.0.1');
  await once(hub, 'listening');
  const address = hub.address();
  if (address === null || typeof address === 'string') throw new Error('hub is not TCP');
  const proxy = await startDavProxy({
    hubOrigin: `http://127.0.0.1:${String(address.port)}`,
    rootId: ROOT,
    token: TOKEN,
  });
  const stack: Stack = {
    hub,
    seen,
    proxy,
    sessionUrl: proxy.url,
    reply: (next) => {
      answer = next;
    },
  };
  stacks.push(stack);
  return stack;
}

function multistatus(...hrefs: readonly string[]): string {
  const rows = hrefs.map((href) => `<D:response><D:href>${href}</D:href></D:response>`).join('');
  return `<?xml version="1.0"?><D:multistatus xmlns:D="DAV:">${rows}</D:multistatus>`;
}

const XML = { 'content-type': 'application/xml; charset=utf-8' };

describe('loopback WebDAV proxy', () => {
  let logged: unknown[][];

  beforeEach(() => {
    logged = [];
    for (const channel of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, channel).mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const stack of stacks.splice(0)) {
      await stack.proxy.stop();
      stack.hub.close();
      stack.hub.closeAllConnections();
    }
  });

  it('listens on the loopback address only, on a random path per session', async () => {
    const first = await startStack();
    const second = await startStack();
    const url = new URL(first.sessionUrl);
    expect(url.hostname).toBe('127.0.0.1');
    expect(url.pathname).toMatch(/^\/[0-9a-f]{32}\/$/);
    expect(url.pathname).not.toBe(new URL(second.sessionUrl).pathname);
    const bound = await fetch(`http://127.0.0.1:${String(first.proxy.port)}/`, {
      method: 'OPTIONS',
    });
    expect(bound.status).toBe(404);
  });

  it('answers 404 outside the session path without reaching the hub', async () => {
    const stack = await startStack();
    const outside = `http://127.0.0.1:${String(stack.proxy.port)}${HUB_PREFIX}`;
    expect((await fetch(outside, { method: 'PROPFIND' })).status).toBe(404);
    expect(stack.seen).toHaveLength(0);
  });

  it('refuses a request whose Host is not the loopback address', async () => {
    const stack = await startStack();
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: stack.proxy.port,
          path: '/',
          method: 'OPTIONS',
          headers: { host: 'attacker.example' },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(421);
    expect(stack.seen).toHaveLength(0);
  });

  it('adds the device token itself and drops credentials from the client', async () => {
    const stack = await startStack();
    await fetch(`${stack.sessionUrl}Docs/a.txt`, {
      method: 'PUT',
      headers: { authorization: 'Basic Y2xpZW50OnNlY3JldA==' },
      body: 'alpha',
    });
    const [request] = stack.seen;
    expect(request?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(request?.url).toBe(`${HUB_PREFIX}Docs/a.txt`);
    expect(request?.body).toBe('alpha');
  });

  it('never exposes the token in a URL, a response or a log line', async () => {
    const stack = await startStack();
    stack.reply(() => ({ status: 207, headers: XML, body: multistatus(`${HUB_PREFIX}x`) }));
    const response = await fetch(`${stack.sessionUrl}x`, { method: 'PROPFIND' });
    const exposed = [
      stack.sessionUrl,
      await response.text(),
      JSON.stringify([...response.headers]),
      JSON.stringify(logged),
    ].join('\n');
    expect(exposed).not.toContain(TOKEN);
  });

  it('rewrites hrefs of any namespace prefix, absolute URLs and escaped names', async () => {
    const stack = await startStack();
    const origin = new URL(stack.sessionUrl).pathname;
    stack.reply(() => ({
      status: 207,
      headers: XML,
      body:
        '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">' +
        `<d:response><d:href>${HUB_PREFIX}</d:href></d:response>` +
        `<d:response><d:href>${HUB_PREFIX}R%26D%20plan.txt</d:href></d:response>` +
        `<d:response><d:href>http://hub.local${HUB_PREFIX}a&amp;b.txt</d:href></d:response>` +
        '<d:lockdiscovery><d:locktoken><d:href>opaquelocktoken:abc</d:href></d:locktoken></d:lockdiscovery>' +
        `<!-- <d:href>${HUB_PREFIX}ignored</d:href> -->` +
        '</d:multistatus>',
    }));
    const text = await (await fetch(stack.sessionUrl, { method: 'PROPFIND' })).text();
    expect(text).toContain(`<d:href>${origin}</d:href>`);
    expect(text).toContain(`<d:href>${origin}R%26D%20plan.txt</d:href>`);
    expect(text).toContain('opaquelocktoken:abc');
    expect(text).toContain(`<!-- <d:href>${HUB_PREFIX}ignored</d:href> -->`);
    expect(text.replace(/<!--[\s\S]*?-->/, '')).not.toContain(HUB_PREFIX);
  });

  it('recomputes Content-Length after rewriting', async () => {
    const stack = await startStack();
    stack.reply(() => ({ status: 207, headers: XML, body: multistatus(`${HUB_PREFIX}f`) }));
    const response = await fetch(`${stack.sessionUrl}f`, { method: 'PROPFIND' });
    const body = await response.arrayBuffer();
    expect(Number(response.headers.get('content-length'))).toBe(body.byteLength);
  });

  it('translates Destination into the hub namespace for MOVE', async () => {
    const stack = await startStack();
    await fetch(`${stack.sessionUrl}a.txt`, {
      method: 'MOVE',
      headers: { destination: `${stack.sessionUrl}Folder/b.txt`, overwrite: 'F' },
    });
    const [request] = stack.seen;
    expect(request?.headers['destination']).toMatch(
      new RegExp(`^http://127\\.0\\.0\\.1:\\d+${HUB_PREFIX}Folder/b\\.txt$`),
    );
    expect(request?.headers['overwrite']).toBe('F');
  });

  it('refuses a Destination outside the mount without reaching the hub', async () => {
    const stack = await startStack();
    const foreign = [
      `http://127.0.0.1:${String(stack.proxy.port)}/elsewhere/b.txt`,
      'http://attacker.example/b.txt',
    ];
    for (const destination of foreign) {
      const response = await fetch(`${stack.sessionUrl}a.txt`, {
        method: 'COPY',
        headers: { destination },
      });
      expect(response.status).toBe(502);
    }
    expect(stack.seen).toHaveLength(0);
  });

  it('translates the resource tags of an If header and passes lock tokens untouched', async () => {
    const stack = await startStack();
    const tag = `${stack.sessionUrl}lock.txt`;
    await fetch(`${stack.sessionUrl}lock.txt`, {
      method: 'PUT',
      headers: { if: `<${tag}> (<opaquelocktoken:1234>)`, 'lock-token': '<opaquelocktoken:1234>' },
      body: 'held',
    });
    const [request] = stack.seen;
    expect(request?.headers['if']).toMatch(
      new RegExp(
        `^<http://127\\.0\\.0\\.1:\\d+${HUB_PREFIX}lock\\.txt> \\(<opaquelocktoken:1234>\\)$`,
      ),
    );
    expect(request?.headers['lock-token']).toBe('<opaquelocktoken:1234>');
  });

  it('passes Range, Depth and the query through and relays partial content', async () => {
    const stack = await startStack();
    stack.reply(() => ({
      status: 206,
      headers: { 'content-range': 'bytes 2-5/10' },
      body: '2345',
    }));
    const response = await fetch(`${stack.sessionUrl}r.bin?v=1`, {
      headers: { range: 'bytes=2-5', depth: '0' },
    });
    const [request] = stack.seen;
    expect(response.status).toBe(206);
    expect(await response.text()).toBe('2345');
    expect(request?.url).toBe(`${HUB_PREFIX}r.bin?v=1`);
    expect(request?.headers.range).toBe('bytes=2-5');
    expect(request?.headers['depth']).toBe('0');
  });

  it('maps a redirect from the hub back into the session path', async () => {
    const stack = await startStack();
    stack.reply(() => ({ status: 301, headers: { location: `${HUB_PREFIX}Docs/` } }));
    const response = await fetch(`${stack.sessionUrl}Docs`, { redirect: 'manual' });
    expect(response.headers.get('location')).toBe(`${new URL(stack.sessionUrl).pathname}Docs/`);
  });

  it('keeps the original length of a HEAD answer', async () => {
    const stack = await startStack();
    stack.reply(() => ({ status: 200, headers: { ...XML, 'content-length': '999' } }));
    const response = await fetch(`${stack.sessionUrl}h`, { method: 'HEAD' });
    expect(response.headers.get('content-length')).toBe('999');
  });

  it('answers 502 when the hub cannot be reached', async () => {
    const stack = await startStack();
    stack.hub.close();
    stack.hub.closeAllConnections();
    const response = await fetch(`${stack.sessionUrl}x`, { method: 'PROPFIND' });
    expect(response.status).toBe(502);
  });

  it('stops listening when stopped', async () => {
    const stack = await startStack();
    await stack.proxy.stop();
    await expect(fetch(stack.sessionUrl, { method: 'OPTIONS' })).rejects.toThrow();
  });
});
