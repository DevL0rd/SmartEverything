import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DRIVE_ZIP_PAGE, type DriveItem } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serveZipEntry } from '../../../src/drive/content/zip-entry-route';
import { isZipItem } from '../../../src/drive/content/zip-item';
import { listZip, locateZipEntry, ZipEntryError } from '../../../src/drive/content/zip-index';
import { ZipReadError } from '../../../src/drive/content/zip-file';
import type { MediaLinks } from '../../../src/server/media-links';
import { zipOf, type ZipFileSpec } from './builders';

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'drive-zip-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function archive(files: readonly ZipFileSpec[], zip64 = false): Promise<string> {
  const path = join(folder, 'archive.zip');
  await writeFile(path, zipOf(files, { zip64 }));
  return path;
}

async function bytesOf(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const SAMPLE: readonly ZipFileSpec[] = [
  { name: 'photos', folder: true },
  { name: 'photos/beach.jpg', data: 'jpeg-bytes-here' },
  { name: 'notes.txt', data: 'hello zip world, hello again', method: 'deflated' },
  { name: 'secret.bin', data: 'cipher', encrypted: true },
  { name: 'docs/readme.md', data: '# Readme' },
];

describe('listing an archive', () => {
  it('lists entries in central directory order with kinds, sizes and totals', async () => {
    const listing = await listZip(await archive(SAMPLE), 0, 100);
    expect(listing.items.map((entry) => [entry.index, entry.path, entry.name, entry.kind])).toEqual(
      [
        [0, 'photos', 'photos', 'folder'],
        [1, 'photos/beach.jpg', 'beach.jpg', 'image'],
        [2, 'notes.txt', 'notes.txt', 'document'],
        [3, 'secret.bin', 'secret.bin', 'other'],
        [4, 'docs/readme.md', 'readme.md', 'document'],
      ],
    );
    expect(listing.items[2]).toMatchObject({
      bytes: 'hello zip world, hello again'.length,
      folder: false,
      encrypted: false,
    });
    expect(listing.items[2]?.compressedBytes).not.toBe(listing.items[2]?.bytes);
    expect(listing.items[3]?.encrypted).toBe(true);
    expect(listing.totals).toEqual({
      files: 4,
      folders: 1,
      bytes: listing.items.reduce((sum, entry) => sum + entry.bytes, 0),
      compressedBytes: listing.items.reduce((sum, entry) => sum + entry.compressedBytes, 0),
    });
    expect(listing.next).toBeNull();
    expect(
      DRIVE_ZIP_PAGE.parse({ items: listing.items, next: null, totals: listing.totals }),
    ).toBeDefined();
  });

  it('pages from a cursor index and keeps the totals of the whole archive', async () => {
    const path = await archive(SAMPLE);
    const first = await listZip(path, 0, 2);
    expect(first.items.map((entry) => entry.index)).toEqual([0, 1]);
    expect(first.next).toBe(2);
    const last = await listZip(path, first.next ?? 0, 10);
    expect(last.items.map((entry) => entry.index)).toEqual([2, 3, 4]);
    expect(last.next).toBeNull();
    expect(last.totals).toEqual(first.totals);
  });

  it('reads a zip64 archive', async () => {
    const listing = await listZip(await archive(SAMPLE, true), 0, 100);
    expect(listing.items.map((entry) => entry.path)).toEqual(SAMPLE.map((spec) => spec.name));
    expect(listing.items[1]?.bytes).toBe('jpeg-bytes-here'.length);
  });

  it('reports an archive that is not a zip as unreadable', async () => {
    const path = join(folder, 'broken.zip');
    await writeFile(path, 'not a zip file at all');
    await expect(listZip(path, 0, 10)).rejects.toBeInstanceOf(ZipReadError);
  });
});

describe('reading one entry', () => {
  it('streams a stored entry whole and by range', async () => {
    const source = await locateZipEntry(await archive(SAMPLE), 1);
    expect(source.bytes).toBe(15);
    expect(await bytesOf(source.stream())).toBe('jpeg-bytes-here');
    expect(await bytesOf(source.stream({ start: 5, end: 9 }))).toBe('bytes');
  });

  it('streams a deflated entry whole and by range', async () => {
    const source = await locateZipEntry(await archive(SAMPLE), 2);
    expect(await bytesOf(source.stream())).toBe('hello zip world, hello again');
    expect(await bytesOf(source.stream({ start: 6, end: 8 }))).toBe('zip');
    expect(await bytesOf(source.stream({ start: 20, end: 27 }))).toBe('lo again');
  });

  it('refuses a folder, an encrypted entry and a missing entry', async () => {
    const path = await archive(SAMPLE);
    await expect(locateZipEntry(path, 0)).rejects.toMatchObject({ failure: 'folder' });
    await expect(locateZipEntry(path, 3)).rejects.toMatchObject({ failure: 'encrypted' });
    await expect(locateZipEntry(path, 99)).rejects.toBeInstanceOf(ZipEntryError);
    await expect(locateZipEntry(path, 99)).rejects.toMatchObject({ failure: 'missing' });
  });
});

describe('serving an entry over http', () => {
  let server: Server;
  let base: string;
  let download = false;
  let revision = 1;

  const item = (): DriveItem => ({
    id: '0e000000-0000-4000-8000-000000000001',
    rootId: '0d000000-0000-4000-8000-000000000002',
    parentId: null,
    relPath: 'archive.zip',
    name: 'archive.zip',
    modifiedAt: '2026-11-07T00:00:00.000Z',
    addedAt: '2026-11-07T00:00:00.000Z',
    starred: false,
    shared: false,
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    rev: revision,
    etag: 'tag',
    openedAt: null,
    locked: false,
    lockedHere: false,
    openComments: 0,
    kind: 'document',
    mime: 'application/zip',
    bytes: 1,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
  });

  beforeEach(async () => {
    await mkdir(folder, { recursive: true });
    await archive(SAMPLE);
    download = false;
    revision = 1;
    server = createServer((request, response) => {
      const links: Pick<MediaLinks, 'verifyDrive'> = {
        verifyDrive: () => ({
          rev: 1,
          download,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      };
      serveZipEntry(
        {
          item: () => Promise.resolve(item()),
          root: () => Promise.resolve({ path: folder }),
          links,
          now: () => new Date(),
        },
        { request, response, url: new URL(request.url ?? '/', 'http://hub') },
        { itemId: item().id, index: new URL(request.url ?? '/', 'http://hub').pathname.slice(1) },
      ).catch((cause: unknown) => {
        response.writeHead(
          cause instanceof Error && 'status' in cause ? Number(cause.status) : 500,
        );
        response.end();
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('The test server has no port.');
    base = `http://127.0.0.1:${String(address.port)}`;
  });

  afterEach(async () => {
    server.close();
    await once(server, 'close');
  });

  it('serves a stored entry with ranges and the right type', async () => {
    const whole = await fetch(`${base}/1`);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('content-type')).toBe('image/jpeg');
    expect(whole.headers.get('content-length')).toBe('15');
    expect(await whole.text()).toBe('jpeg-bytes-here');
    const part = await fetch(`${base}/1`, { headers: { range: 'bytes=5-9' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 5-9/15');
    expect(await part.text()).toBe('bytes');
  });

  it('serves a deflated entry with its unpacked length', async () => {
    const response = await fetch(`${base}/2`);
    expect(response.headers.get('content-length')).toBe(
      String('hello zip world, hello again'.length),
    );
    expect(await response.text()).toBe('hello zip world, hello again');
  });

  it('adds an attachment disposition only on a download link', async () => {
    expect((await fetch(`${base}/2`)).headers.get('content-disposition')).toBeNull();
    download = true;
    expect((await fetch(`${base}/2`)).headers.get('content-disposition')).toContain(
      'attachment; filename="notes.txt"',
    );
  });

  it('refuses an encrypted entry, a missing entry and a link made for another revision', async () => {
    expect((await fetch(`${base}/3`)).status).toBe(400);
    expect((await fetch(`${base}/99`)).status).toBe(404);
    revision = 2;
    expect((await fetch(`${base}/1`)).status).toBe(410);
  });
});

describe('recognising archives', () => {
  it('goes by type or extension', () => {
    expect(isZipItem({ name: 'a.zip', mime: 'application/octet-stream' })).toBe(true);
    expect(isZipItem({ name: 'A.ZIP', mime: 'application/octet-stream' })).toBe(true);
    expect(isZipItem({ name: 'a', mime: 'application/zip' })).toBe(true);
    expect(isZipItem({ name: 'a.docx', mime: 'application/vnd.openxmlformats' })).toBe(false);
  });
});
