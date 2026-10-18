import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@smarteverything/domain';
import type { HtmlPublication } from '../../src/preview/documents';
import { previewCsp } from '../../src/preview/headers';
import { servePreviewHtml } from '../../src/preview/html-response';
import { serveProjectAsset } from '../../src/preview/project-response';
import type { ProjectAsset } from '../../src/preview/project-content';
import type { ViewerLease } from '../../src/preview/leases';
import { harnessRig, type Rig } from '../assistant/harness/support/rig';
import { htmlPublication } from './support';

const APP = 'https://app.example';
const SMALL = Buffer.from('0123456789');
const LARGE = Buffer.alloc(9 * 1024 * 1024, 7);

interface Reply {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
}

let rig: Rig;
let server: Server;
let files: Map<string, Buffer>;
let method: string;

function leaseOf(publication: HtmlPublication): ViewerLease {
  return {
    purpose: 'gateway',
    id: 'lease',
    publication,
    clientId: rig.clientId,
    profileId: rig.owner.profileId,
    abort: new AbortController(),
    assetToken: 'token',
    host: 'h.preview.test',
    credential: 'credential',
  };
}

function project(): HtmlPublication {
  const base = htmlPublication(rig, rig.newChat({ kind: 'server' }).id);
  return {
    ...base,
    readAsset: (path, offset, length): Promise<ProjectAsset> => {
      const bytes = files.get(path);
      if (bytes === undefined) return Promise.reject(new ApiError('not_found', 'No such file.'));
      return Promise.resolve({
        bytes: bytes.subarray(offset, offset + length),
        size: bytes.length,
        version: 'v1',
      });
    },
  };
}

beforeEach(async () => {
  rig = await harnessRig();
  files = new Map();
  method = 'GET';
  const publication = project();
  server = createServer((incoming, outgoing) => {
    serveProjectAsset(incoming, outgoing, {
      publication,
      path: incoming.url ?? '/',
      signal: new AbortController().signal,
      ancestors: [APP],
    }).catch((cause: unknown) => {
      outgoing.writeHead(cause instanceof ApiError && cause.code === 'not_found' ? 404 : 500);
      outgoing.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
});

afterEach(async () => {
  server.close();
  await rig.close();
});

function fetchAsset(path: string, headers: Record<string, string> = {}): Promise<Reply> {
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The test server is not listening.');
  return new Promise((resolve, reject) => {
    const req = request(
      { port: address.port, host: '127.0.0.1', path, method, headers, agent: false },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('project assets are served with ranges', () => {
  it('serves a whole file with its type and length', async () => {
    files.set('/app.css', SMALL);
    const reply = await fetchAsset('/app.css');
    expect(reply.status).toBe(200);
    expect(reply.body.toString()).toBe('0123456789');
    expect(reply.headers['content-type']).toBe('text/css; charset=utf-8');
    expect(reply.headers['accept-ranges']).toBe('bytes');
  });

  it('serves a byte range as partial content', async () => {
    files.set('/clip.mp4', SMALL);
    const reply = await fetchAsset('/clip.mp4', { range: 'bytes=2-5' });
    expect(reply.status).toBe(206);
    expect(reply.body.toString()).toBe('2345');
    expect(reply.headers['content-range']).toBe('bytes 2-5/10');
  });

  it('serves open-ended and suffix ranges', async () => {
    files.set('/clip.mp4', SMALL);
    expect((await fetchAsset('/clip.mp4', { range: 'bytes=7-' })).body.toString()).toBe('789');
    expect((await fetchAsset('/clip.mp4', { range: 'bytes=-3' })).body.toString()).toBe('789');
  });

  it('serves a range larger than eight mebibytes', async () => {
    files.set('/big.bin', LARGE);
    const reply = await fetchAsset('/big.bin', { range: 'bytes=0-' });
    expect(reply.status).toBe(206);
    expect(reply.body.length).toBe(LARGE.length);
  });

  it('answers an unsatisfiable range with 416 and the size', async () => {
    files.set('/clip.mp4', SMALL);
    const reply = await fetchAsset('/clip.mp4', { range: 'bytes=50-60' });
    expect(reply.status).toBe(416);
    expect(reply.headers['content-range']).toBe('bytes */10');
  });

  it('ignores a malformed range and serves the whole file', async () => {
    files.set('/clip.mp4', SMALL);
    const reply = await fetchAsset('/clip.mp4', { range: 'pages=1-2' });
    expect(reply.status).toBe(200);
    expect(reply.body.length).toBe(10);
  });

  it('serves a head request without a body', async () => {
    files.set('/app.css', SMALL);
    method = 'HEAD';
    const reply = await fetchAsset('/app.css');
    expect(reply.status).toBe(200);
    expect(reply.headers['content-length']).toBe('10');
    expect(reply.body.length).toBe(0);
  });

  it('labels an unknown extension as a binary stream', async () => {
    files.set('/data.zzz', SMALL);
    expect((await fetchAsset('/data.zzz')).headers['content-type']).toBe(
      'application/octet-stream',
    );
  });
});

describe('every preview page carries the same content security policy', () => {
  it('lets pages load https assets and refuses plugins and a foreign base', async () => {
    files.set('/index.html', SMALL);
    const policy = String((await fetchAsset('/index.html')).headers['content-security-policy']);
    expect(policy).toContain("default-src 'self' http: https: ws: wss: data: blob:");
    expect(policy).toContain("connect-src 'self' http: https: ws: wss: data: blob:");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain(`frame-ancestors ${APP}`);
    expect(policy).not.toContain('sandbox');
  });

  it('keeps plain http and ws resources loading on the native chat-page route', () => {
    const policy = previewCsp(["'none'"]);
    expect(policy).toContain("default-src 'self' http: https: ws: wss:");
    expect(policy).toContain("connect-src 'self' http: https: ws: wss:");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it('gives standalone html the identical policy', async () => {
    const page = htmlPublication(rig, rig.newChat({ kind: 'server' }).id);
    const lease = leaseOf(page);
    const html = createServer((incoming, outgoing) => {
      servePreviewHtml(incoming, outgoing, {
        path: '/',
        lease,
        ancestors: [APP],
      }).catch(() => outgoing.end());
    });
    await new Promise<void>((resolve) => html.listen(0, '127.0.0.1', resolve));
    const address = html.address();
    if (address === null || typeof address === 'string') throw new Error('not listening');
    files.set('/index.html', SMALL);
    const own = String((await fetchAsset('/index.html')).headers['content-security-policy']);
    const standalone = await new Promise<string>((resolve) => {
      request({ port: address.port, host: '127.0.0.1', path: '/' }, (res) => {
        res.resume();
        resolve(String(res.headers['content-security-policy']));
      }).end();
    });
    html.close();
    expect(standalone).toBe(own);
  });
});
