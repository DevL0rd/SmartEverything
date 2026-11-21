import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DriveFolderIcon } from '../../../src/store/repositories/drive-folder-icons';
import type { DriveItem } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serveFolderIcon } from '../../../src/drive/content/folder-icon/icon-route';
import { folderIconFile } from '../../../src/drive/content/folder-icon/refresh';
import { pngOf, solid } from './builders';

const FOLDER = '0e000000-0000-4000-8000-000000000001';
const SHA = 'a'.repeat(64);

let derived: string;
let server: Server;
let base: string;
const revision = 1;
let icon: DriveFolderIcon | undefined;
let item: DriveItem | undefined;

function folderItem(rev: number): DriveItem {
  return {
    id: FOLDER,
    rootId: '0d000000-0000-4000-8000-000000000002',
    parentId: null,
    relPath: 'trips',
    name: 'trips',
    modifiedAt: '2026-11-14T00:00:00.000Z',
    addedAt: '2026-11-14T00:00:00.000Z',
    starred: false,
    shared: false,
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    rev,
    etag: 'tag',
    openedAt: null,
    locked: false,
    lockedHere: false,
    openComments: 0,
    colour: null,
    iconHint: true,
    kind: 'folder',
    childCount: 0,
    bytes: 0,
    totalBytes: 0,
    totalFiles: 0,
  };
}

beforeEach(async () => {
  derived = await mkdtemp(join(tmpdir(), 'drive-icon-route-'));
  item = folderItem(1);
  icon = {
    folderItemId: FOLDER,
    source: 'named_file',
    sourceRelPath: 'trips/folder.png',
    sourceRev: 1,
    imageSha256: SHA,
    updatedAt: '2026-11-14T00:00:00.000Z',
  };
  await mkdir(derived, { recursive: true });
  await writeFile(
    folderIconFile({ derivedDirectory: (): string => derived }, FOLDER, SHA),
    await pngOf(4, 4, solid(4, 4, [1, 2, 3, 255])),
  );
  server = createServer((request, response) => {
    serveFolderIcon(
      {
        folder: (): Promise<DriveItem | undefined> => Promise.resolve(item),
        icon: (): Promise<DriveFolderIcon | undefined> => Promise.resolve(icon),
        links: {
          verifyDrive: () => ({
            rev: revision,
            download: false,
            expiresAt: new Date(Date.now() + 60_000),
          }),
        },
        derivedDirectory: (): string => derived,
        now: () => new Date(),
      },
      { request, response, url: new URL(request.url ?? '/', 'http://hub') },
      FOLDER,
    ).catch((cause: unknown) => {
      response.writeHead(cause instanceof Error && 'status' in cause ? Number(cause.status) : 500);
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
  await rm(derived, { recursive: true, force: true });
});

describe('serving a folder icon', () => {
  it('serves the cached PNG with the icon hash as its tag', async () => {
    const response = await fetch(base);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('etag')).toBe(`"${SHA}"`);
    expect(new Uint8Array(await response.arrayBuffer()).subarray(1, 4)).toEqual(
      new Uint8Array([0x50, 0x4e, 0x47]),
    );
    expect((await fetch(base, { headers: { 'if-none-match': `"${SHA}"` } })).status).toBe(304);
  });

  it('refuses a folder with no icon, a missing cache file, a file and a stale link', async () => {
    icon = undefined;
    expect((await fetch(base)).status).toBe(404);
    icon = {
      folderItemId: FOLDER,
      source: 'named_file',
      sourceRelPath: 'trips/folder.png',
      sourceRev: 1,
      imageSha256: 'b'.repeat(64),
      updatedAt: '2026-11-14T00:00:00.000Z',
    };
    expect((await fetch(base)).status).toBe(404);
    item = undefined;
    expect((await fetch(base)).status).toBe(404);
    item = folderItem(2);
    expect((await fetch(base)).status).toBe(410);
  });
});
