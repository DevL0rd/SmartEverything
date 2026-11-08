import { createServer, type Server } from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serveBytes, type ByteSource } from '../../src/server/file-serve';

const BODY = '0123456789';

let server: Server;
let base = '';
let source: ByteSource;

function sourceOf(headers: Record<string, string>, etag?: string): ByteSource {
  return {
    size: BODY.length,
    ...(etag === undefined ? {} : { etag }),
    headers,
    stream: (range) =>
      Readable.from([
        Buffer.from(range === undefined ? BODY : BODY.slice(range.start, range.end + 1)),
      ]),
  };
}

beforeEach(async () => {
  source = sourceOf({ 'content-type': 'application/octet-stream' }, 'abc');
  server = createServer((request, response) => {
    void serveBytes(source, request, response);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No port.');
  base = `http://127.0.0.1:${String(address.port)}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
});

async function get(headers: Record<string, string> = {}): Promise<Response> {
  return fetch(base, { headers });
}

describe('serveBytes', () => {
  it('sends the whole body with range, etag and nosniff headers', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(BODY);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('etag')).toBe('"abc"');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('answers byte, suffix and open ranges with 206', async () => {
    const part = await get({ range: 'bytes=2-4' });
    expect([part.status, await part.text(), part.headers.get('content-range')]).toStrictEqual([
      206,
      '234',
      'bytes 2-4/10',
    ]);
    const suffix = await get({ range: 'bytes=-3' });
    expect([suffix.status, await suffix.text()]).toStrictEqual([206, '789']);
    const open = await get({ range: 'bytes=6-' });
    expect([open.status, await open.text()]).toStrictEqual([206, '6789']);
  });

  it('answers an unsatisfiable range with 416 and the size', async () => {
    const response = await get({ range: 'bytes=20-' });
    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe('bytes */10');
  });

  it('answers a matching If-None-Match with 304 and no body', async () => {
    const response = await get({ 'if-none-match': '"abc"' });
    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe('"abc"');
    expect(await response.text()).toBe('');
  });

  it('honours Range when If-Range matches the etag', async () => {
    const response = await get({ range: 'bytes=0-1', 'if-range': '"abc"' });
    expect([response.status, await response.text()]).toStrictEqual([206, '01']);
  });

  it('sends the whole body when If-Range does not match', async () => {
    const response = await get({ range: 'bytes=0-1', 'if-range': '"other"' });
    expect([response.status, await response.text()]).toStrictEqual([200, BODY]);
  });

  it('ignores If-Range and Range conditions without an etag by sending the whole body', async () => {
    source = sourceOf({ 'content-type': 'video/mp4' });
    const response = await get({ range: 'bytes=0-1', 'if-range': '"abc"' });
    expect([response.status, await response.text()]).toStrictEqual([200, BODY]);
    expect(response.headers.get('etag')).toBeNull();
  });

  it('serves HTML and SVG as attachments and keeps an explicit disposition', async () => {
    source = sourceOf({ 'content-type': 'text/html; charset=utf-8' });
    expect((await get()).headers.get('content-disposition')).toBe('attachment');
    source = sourceOf({ 'content-type': 'image/svg+xml' });
    expect((await get()).headers.get('content-disposition')).toBe('attachment');
    source = sourceOf({
      'content-type': 'image/svg+xml',
      'content-disposition': 'attachment; filename="a.svg"',
    });
    expect((await get()).headers.get('content-disposition')).toBe('attachment; filename="a.svg"');
    source = sourceOf({ 'content-type': 'image/png' });
    expect((await get()).headers.get('content-disposition')).toBeNull();
  });
});
