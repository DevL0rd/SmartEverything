import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join, resolve } from 'node:path';
import { ApiError, matchPath } from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveShares, type ShareActor, type ShareOrigin } from '../../../src/drive/shares';
import type { RawRoute } from '../../../src/server/http-server';
import { shareRoutes } from '../../../src/server/share-route';
import type { DriveItemDraft } from '../../../src/store/repositories/drive-items';
import { driveTestStore } from '../../drive/spaces-fixture';
import { personalDriveRoot } from '../../store/drive-roots-fixture';
import type { TestStore } from '../../support/store';

const NOW = new Date('2026-11-07T00:00:00.000Z');
const ROOT = '0d000000-0000-4000-8000-000000000012';
const ALBUM = '0a000000-0000-4000-8000-000000000001';
const FIXTURE = resolve(import.meta.dirname, '../../fixtures/photos/exif-full.jpg');
const IN = '0d000000-0000-4000-8000-0000000000b1';
const ALSO = '0d000000-0000-4000-8000-0000000000b2';
const OUT = '0d000000-0000-4000-8000-0000000000b3';
const SECRET = '0d000000-0000-4000-8000-0000000000b4';

let opened: TestStore;
let server: Server;
let base = '';
let shares: DriveShares;
let owner: ShareActor;
let member: ShareActor;

function draft(id: string, relPath: string): DriveItemDraft {
  return {
    id,
    rootId: ROOT,
    parentId: null,
    relPath,
    name: relPath.split('/').at(-1) ?? relPath,
    modifiedAt: NOW.toISOString(),
    addedAt: NOW.toISOString(),
    starred: false,
    shared: false,
    outside: false,
    remoteId: null,
    remoteRev: null,
    addedByProfileId: null,
    mime: 'image/jpeg',
    bytes: 10,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
    takenAt: null,
    width: null,
    height: null,
    orientation: null,
    camera: null,
    exposure: null,
    place: null,
    kind: 'image',
  };
}

function dispatch(routes: readonly RawRoute[]): Server {
  return createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://hub').pathname;
    for (const route of routes) {
      const params = matchPath(route.path, pathname);
      if (params !== null && route.method === request.method) {
        route.handle(request, response, params).catch((cause: unknown) => {
          response.writeHead(cause instanceof ApiError ? cause.status : 500).end();
        });
        return;
      }
    }
    response.writeHead(404).end();
  });
}

function tokenOf(url: string): string {
  return matchPath('/s/:token', new URL(url).pathname)?.['token'] ?? '';
}

async function link(
  options: { actor?: ShareActor; albumId?: string; password?: string | null } = {},
): Promise<string> {
  const created = await shares.create(options.actor ?? owner, {
    albumId: options.albumId ?? ALBUM,
    permission: 'view',
    expiresAt: null,
    password: options.password ?? null,
  });
  return tokenOf(created.url);
}

const LISTING = z.object({
  id: z.string(),
  name: z.string(),
  entries: z.array(z.object({ id: z.string(), url: z.string() })),
  next: z.string().nullable(),
});

type Listing = z.infer<typeof LISTING>;

const UNLOCKED = z.object({ url: z.string() });

async function listing(path: string): Promise<Listing> {
  const response = await fetch(`${base}${path}`);
  expect(response.status).toBe(200);
  return LISTING.parse(await response.json());
}

beforeEach(async () => {
  opened = await driveTestStore(() => NOW);
  const { store } = opened;
  owner = { profileId: store.profiles.first().id, owner: true };
  member = { profileId: store.profiles.create({ name: 'Robin' }).id, owner: false };
  store.driveRoots.insert(personalDriveRoot(ROOT, owner.profileId));
  const directory = opened.layout.person(owner.profileId).drive;
  await mkdir(join(directory, '.locked'), { recursive: true });
  for (const name of ['in.jpg', 'also.jpg', 'out.jpg', '.locked/secret.jpg']) {
    await copyFile(FIXTURE, join(directory, name));
  }
  await writeFile(join(directory, 'note.txt'), 'x');
  for (const [id, path] of [
    [IN, 'in.jpg'],
    [ALSO, 'also.jpg'],
    [OUT, 'out.jpg'],
    [SECRET, '.locked/secret.jpg'],
  ] as const) {
    store.driveItems.write({ item: draft(id, path), identity: { dev: '1', ino: id.slice(-4) } });
  }
  store.driveAlbums.insert({
    id: ALBUM,
    title: 'Holiday',
    kind: 'manual',
    surface: 'photos',
    scope: 'person',
    ownerProfileId: owner.profileId,
    coverItemId: null,
  });
  store.driveAlbums.addItems(ALBUM, [IN, ALSO, SECRET], owner.profileId);
  shares = new DriveShares({
    store,
    origin: (): ShareOrigin => ({ url: 'http://hub.local:8080', public: false }),
    now: (): Date => NOW,
  });
  server = dispatch(
    shareRoutes({ shares, layout: opened.layout, removeLocationOutside: (): boolean => false }),
  );
  await new Promise<void>((done) => {
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The server did not listen.');
  base = `http://127.0.0.1:${String(address.port)}`;
});

afterEach(async () => {
  await new Promise((done) => server.close(done));
  await opened.close();
});

describe('album share links', () => {
  it('open the album like a folder and serve its photos', async () => {
    const token = await link();
    const page = await listing(`/s/${token}`);
    expect(page).toMatchObject({ id: ALBUM, name: 'Holiday', next: null });
    expect(page.entries.map((entry) => entry.id)).toEqual([IN, ALSO]);
    const bytes = await fetch(`${base}${page.entries[0]?.url ?? ''}`);
    expect(bytes.status).toBe(200);
    expect((await bytes.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('open only that album: not other photos, not the locked folder', async () => {
    const token = await link();
    expect((await fetch(`${base}/s/${token}/${OUT}`)).status).toBe(404);
    expect((await fetch(`${base}/s/${token}/${SECRET}`)).status).toBe(404);
    expect((await fetch(`${base}/s/${token}/${IN}`)).status).toBe(200);
  });

  it('stop showing a photo the moment it leaves the album', async () => {
    const token = await link();
    opened.store.driveAlbums.removeItems(ALBUM, [IN]);
    expect((await fetch(`${base}/s/${token}/${IN}`)).status).toBe(404);
    expect((await listing(`/s/${token}`)).entries.map((entry) => entry.id)).toEqual([ALSO]);
  });

  it('are made only by the person whose album it is', async () => {
    await expect(link({ actor: member })).rejects.toMatchObject({ code: 'not_found' });
    await expect(link({ albumId: '0a000000-0000-4000-8000-0000000000ff' })).rejects.toMatchObject({
      code: 'not_found',
    });
    opened.store.photoAlbumMembers.invite(ALBUM, member.profileId, 'contributor', owner.profileId);
    await expect(link({ actor: member })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('can be revoked and then answer not found', async () => {
    const created = await shares.create(owner, {
      albumId: ALBUM,
      permission: 'view',
      expiresAt: null,
      password: null,
    });
    expect(created.share).toMatchObject({ albumId: ALBUM, itemId: null });
    await shares.revoke(owner, created.share.id);
    expect((await fetch(`${base}/s/${tokenOf(created.url)}`)).status).toBe(404);
  });

  it('can need a password, which unlocks signed links to the album and its photos', async () => {
    const token = await link({ password: 'correct horse battery staple' });
    expect((await fetch(`${base}/s/${token}`)).status).toBe(401);
    const wrong = await fetch(`${base}/s/${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'nope' }),
    });
    expect(wrong.status).toBe(401);
    const unlocked = await fetch(`${base}/s/${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct horse battery staple' }),
    });
    expect(unlocked.status).toBe(200);
    const { url } = UNLOCKED.parse(await unlocked.json());
    const page = await listing(url);
    expect(page.entries).toHaveLength(2);
    expect((await fetch(`${base}${page.entries[0]?.url ?? ''}`)).status).toBe(200);
  });

  it('count the opens', async () => {
    const created = await shares.create(owner, {
      albumId: ALBUM,
      permission: 'view',
      expiresAt: null,
      password: null,
    });
    await listing(`/s/${tokenOf(created.url)}`);
    expect(opened.store.driveShares.byId(created.share.id).opens).toBe(1);
    expect(opened.store.driveShares.forAlbum(ALBUM)).toHaveLength(1);
  });
});
