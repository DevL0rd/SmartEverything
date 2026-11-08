import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { localMediaResponse } from '../../src/photos/files';
import type { PhotoFile } from '../../src/photos/scan';

const id = 'a'.repeat(64);
let root = '';
const item = {
  id,
  name: 'video.mp4',
  mimeType: 'video/mp4',
  bytes: 10,
  modifiedAt: 1,
  takenAt: 1,
  uri: `app://smarteverything/local-media/${id}`,
  video: true,
};
const library = {
  file: (): Promise<PhotoFile> => Promise.resolve({ path: join(root, 'video.mp4'), item }),
};
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'desktop-media-response-'));
  await writeFile(join(root, 'video.mp4'), '0123456789');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function rangeRequest(range?: string, method = 'GET'): Promise<Response> {
  const request = new Request(item.uri, { method, headers: range === undefined ? {} : { range } });
  return localMediaResponse(library, request);
}

describe('local photo media serving', () => {
  it('streams full media with length and supported ranges', async () => {
    const response = await rangeRequest();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('10');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(await response.text()).toBe('0123456789');
  });

  it.each([
    ['bytes=2-4', '234', 'bytes 2-4/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=8-100', '89', 'bytes 8-9/10'],
  ])(
    'streams the exact requested range %s with206 semantics',
    async (range, body, contentRange) => {
      const response = await rangeRequest(range);
      expect(response.status).toBe(206);
      expect(response.headers.get('content-range')).toBe(contentRange);
      expect(response.headers.get('content-length')).toBe(String(body.length));
      expect(await response.text()).toBe(body);
    },
  );

  it.each(['bytes=10-', 'bytes=-0', 'bytes=5-2', 'bytes=0-1,5-6', 'bytes=oops', 'items=1-2'])(
    'answers416 for unsupported or unsatisfiable range %s',
    async (range) => {
      const response = await rangeRequest(range);
      expect(response.status).toBe(416);
      expect(response.headers.get('content-range')).toBe('bytes */10');
      expect(response.headers.get('content-length')).toBe('0');
      expect(await response.text()).toBe('');
    },
  );

  it('answers HEAD with full content length and no media body', async () => {
    const response = await rangeRequest('bytes=2-4', 'HEAD');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('10');
    expect(response.headers.get('content-range')).toBeNull();
    expect(await response.text()).toBe('');
  });

  it('does not open arbitrary file paths or unknown IDs and rejects writes', async () => {
    const unknown = {
      file: (): Promise<never> => Promise.reject(new Error('Missing')),
    };
    expect((await localMediaResponse(unknown, new Request(item.uri))).status).toBe(410);
    const traversal = new Request('app://smarteverything/local-media/%2Fetc%2Fpasswd');
    expect((await localMediaResponse(unknown, traversal)).status).toBe(404);
    expect((await rangeRequest(undefined, 'POST')).status).toBe(405);
  });

  it('closes the file stream when the media request is aborted', async () => {
    const abort = new AbortController();
    const response = await localMediaResponse(
      library,
      new Request(item.uri, { signal: abort.signal }),
    );
    abort.abort();
    await expect(response.arrayBuffer()).rejects.toThrow();
  });

  it('returns an empty200 for a zero-byte media file', async () => {
    await writeFile(join(root, 'video.mp4'), '');
    const empty = {
      file: (): Promise<PhotoFile> =>
        Promise.resolve({ path: join(root, 'video.mp4'), item: { ...item, bytes: 0 } }),
    };
    const response = await localMediaResponse(empty, new Request(item.uri));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('0');
    expect(await response.text()).toBe('');
  });
});
