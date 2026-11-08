import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { ApiError, matchPath, type DriveItem, type DriveRoot } from '@smarteverything/domain';
import { load } from 'exifreader';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { updateDriveSettings } from '../../src/drive/settings';
import type { DriveActor } from '../../src/drive/service-read';
import {
  DriveShares,
  GUESS_LIMIT,
  GUESS_WINDOW_MS,
  hashToken,
  type ShareOrigin,
} from '../../src/drive/shares';
import { ffmpegPath } from '../../src/media/ffmpeg-path';
import type { RawRoute } from '../../src/server/http-server';
import { LINK_LIFETIME_SECONDS } from '../../src/server/media-links';
import { shareRoutes } from '../../src/server/share-route';
import type { DriveItemDraft } from '../../src/store/repositories/drive-items';
import { UNSYNCED } from '../../src/store/repositories/drive-roots';
import { captureLogs, type CapturedLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const run = promisify(execFile);
const FIXTURES = resolve(import.meta.dirname, '../fixtures/photos');
const NOW = new Date('2026-11-07T00:00:00.000Z');
const ROOT = '0d000000-0000-4000-8000-000000000011';
const FOLDER = '0d000000-0000-4000-8000-0000000000a1';
const INSIDE = '0d000000-0000-4000-8000-0000000000a2';
const OUTSIDE_FILE = '0d000000-0000-4000-8000-0000000000a3';
const NESTED = '0d000000-0000-4000-8000-0000000000a4';
const PHOTO = '0d000000-0000-4000-8000-0000000000b1';
const HEIC = '0d000000-0000-4000-8000-0000000000b2';
const MOVIE = '0d000000-0000-4000-8000-0000000000b3';
const PAGE = '0d000000-0000-4000-8000-0000000000b4';
const BODY = 'the quick brown fox';
const PASSWORD = 'correct horse battery staple';
const LOCAL = 'http://hub.local:8080';

let opened: TestStore;
let logs: CapturedLogs;
let server: Server;
let base = '';
let now = NOW;
let origin: ShareOrigin = { url: LOCAL, public: false };
let removeLocation = true;
let shares: DriveShares;
let owner: DriveActor;
let member: DriveActor;
let rootDirectory = '';

function tokenOf(url: string): string {
  return matchPath('/s/:token', new URL(url).pathname)?.['token'] ?? '';
}

type DriveItemKind = DriveItem['kind'];

const MIMES: Readonly<Record<string, string>> = {
  'exif-full.jpg': 'image/jpeg',
  'exif-full.heic': 'image/heic',
  'live-photo.mov': 'video/quicktime',
  'page.html': 'text/html',
};

function entryFor(
  kind: DriveItemKind,
  id: string,
  parentId: string | null,
  relPath: string,
): DriveItemDraft {
  const name = relPath.split('/').at(-1) ?? relPath;
  const base = {
    id,
    rootId: ROOT,
    parentId,
    relPath,
    name,
    modifiedAt: NOW.toISOString(),
    addedAt: NOW.toISOString(),
    starred: false,
    outside: false,
    remoteId: null,
    remoteRev: null,
    addedByProfileId: null,
  };
  const file = {
    ...base,
    mime: MIMES[name] ?? 'text/plain',
    bytes: BODY.length,
    sha256: null,
    integrity: 'unknown' as const,
    thumb: { state: 'none' as const },
  };
  const media = {
    takenAt: null,
    width: null,
    height: null,
    orientation: null,
    camera: null,
    exposure: null,
    place: null,
  };
  if (kind === 'folder') return { ...base, kind: 'folder', childCount: 0, bytes: 0 };
  if (kind === 'image') return { ...file, ...media, kind: 'image' };
  if (kind === 'video') return { ...file, ...media, kind: 'video', durationMs: null };
  return { ...file, kind: 'document' };
}

function item(id: string, parentId: string | null, relPath: string, kind: DriveItemKind): void {
  opened.store.driveItems.write({
    item: entryFor(kind, id, parentId, relPath),
    identity: { dev: '1', ino: id.slice(-4) },
  });
}

function rootRow(path: string): DriveRoot {
  return {
    id: ROOT,
    kind: 'managed',
    label: 'Shared',
    scope: 'home',
    ownerProfileId: null,
    path,
    readOnly: false,
    versions: true,
    volume: null,
    indexId: 'index-shared',
    state: 'ready',
    stateReason: null,
    items: 0,
    folders: 0,
    bytes: 0,
    scannedAt: null,
    health: { hashedShare: 0, verifiedShare: 0, corrupt: 0, lastScrubAt: null, lastBackupAt: null },
    inPhotos: false,
    skipPatterns: [],
    includeHidden: false,
    synced: false,
    sync: UNSYNCED,
  };
}

async function build(): Promise<void> {
  rootDirectory = join(opened.directory, 'root');
  await mkdir(join(rootDirectory, 'album', 'deep'), { recursive: true });
  await writeFile(join(rootDirectory, 'album', 'inside.txt'), BODY);
  await writeFile(join(rootDirectory, 'album', 'deep', 'nested.txt'), 'nested');
  await writeFile(join(rootDirectory, 'secret.txt'), 'not shared');
  await writeFile(join(rootDirectory, 'page.html'), '<script>alert(1)</script>');
  for (const name of ['exif-full.jpg', 'exif-full.heic', 'live-photo.mov']) {
    await copyFile(join(FIXTURES, name), join(rootDirectory, name));
  }
  opened.store.driveRoots.insert(rootRow(rootDirectory));
  item(FOLDER, null, 'album', 'folder');
  item(INSIDE, FOLDER, 'album/inside.txt', 'document');
  item(NESTED, FOLDER, 'album/deep/nested.txt', 'document');
  item(OUTSIDE_FILE, null, 'secret.txt', 'document');
  item(PHOTO, null, 'exif-full.jpg', 'image');
  item(HEIC, null, 'exif-full.heic', 'image');
  item(MOVIE, null, 'live-photo.mov', 'video');
  item(PAGE, null, 'page.html', 'document');
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

async function create(
  itemId: string,
  options: Partial<{
    permission: 'view' | 'download';
    expiresAt: string | null;
    password: string | null;
    actor: DriveActor;
  }> = {},
): Promise<{ url: string; token: string; id: string }> {
  const created = await shares.create(options.actor ?? owner, {
    itemId,
    permission: options.permission ?? 'view',
    expiresAt: options.expiresAt ?? null,
    password: options.password ?? null,
  });
  return { url: created.url, token: tokenOf(created.url), id: created.share.id };
}

async function unlock(token: string, password: string): Promise<Response> {
  return fetch(`${base}/s/${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

async function unlocked(token: string): Promise<string> {
  const response = await unlock(token, PASSWORD);
  expect(response.status).toBe(200);
  const link = urlOf(await response.json());
  return `${base}${link}`;
}

function entriesOf(value: unknown): readonly { name: string; url: string }[] {
  if (
    typeof value === 'object' &&
    value !== null &&
    'entries' in value &&
    Array.isArray(value.entries)
  )
    return value.entries.map((entry: unknown) => {
      if (
        typeof entry === 'object' &&
        entry !== null &&
        'name' in entry &&
        typeof entry.name === 'string' &&
        'url' in entry &&
        typeof entry.url === 'string'
      )
        return { name: entry.name, url: entry.url };
      throw new Error('Malformed entry.');
    });
  throw new Error('The answer carried no entries.');
}

function urlOf(value: unknown): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'url' in value &&
    typeof value.url === 'string'
  )
    return value.url;
  throw new Error('The answer carried no url.');
}

beforeEach(async () => {
  logs = captureLogs();
  now = NOW;
  origin = { url: LOCAL, public: false };
  removeLocation = true;
  opened = await testStore();
  const { store } = opened;
  owner = { profileId: store.profiles.first().id, owner: true };
  member = { profileId: store.profiles.create({ name: 'Robin' }).id, owner: false };
  await build();
  shares = new DriveShares({
    store,
    origin: (): ShareOrigin => origin,
    now: (): Date => now,
  });
  server = dispatch(
    shareRoutes({
      shares,
      layout: opened.layout,
      removeLocationOutside: (): boolean => removeLocation,
    }),
  );
  await new Promise<void>((resolveListening) => {
    server.listen(0, '127.0.0.1', resolveListening);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('The server has no port.');
  base = `http://127.0.0.1:${String(address.port)}`;
});

afterEach(async () => {
  await new Promise<void>((resolveClosed) => {
    server.close(() => {
      resolveClosed();
    });
  });
  await opened.close();
});

describe('creating links', () => {
  it('stores only the SHA-256 of a 256-bit token and builds the link from the trusted origin', async () => {
    const made = await create(INSIDE);
    expect(made.token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(made.url).toBe(`${LOCAL}/s/${made.token}`);
    const stored = opened.store.driveShares.byTokenHash(hashToken(made.token));
    expect(stored?.share.id).toBe(made.id);
    const database = new DatabaseSync(join(opened.directory, 'test.db'), { readOnly: true });
    const rows = database.prepare('select * from drive_shares').all();
    database.close();
    expect(JSON.stringify(rows)).not.toContain(made.token);
  });

  it('reports a link outside the home only when public_url is set', async () => {
    const lan = await shares.create(owner, {
      itemId: INSIDE,
      permission: 'view',
      expiresAt: null,
      password: null,
    });
    expect(lan.public).toBe(false);
    origin = { url: 'https://nas.example.org/', public: true };
    const wide = await shares.create(owner, {
      itemId: INSIDE,
      permission: 'view',
      expiresAt: null,
      password: null,
    });
    expect(wide.public).toBe(true);
    expect(wide.url.startsWith('https://nas.example.org/s/')).toBe(true);
  });

  it('lets a member create only when the owner allows it, and only for items they can see', async () => {
    await expect(create(INSIDE, { actor: member })).rejects.toThrow(/not allowed/u);
    updateDriveSettings(opened.store, { membersMayShare: true });
    const made = await create(INSIDE, { actor: member });
    expect(made.id).toBeTruthy();
    expect(shares.list(member, INSIDE)).toHaveLength(1);
    expect(shares.list(owner, INSIDE)).toHaveLength(1);
  });

  it('refuses an expiry in the past', async () => {
    await expect(
      create(INSIDE, { expiresAt: new Date(NOW.getTime() - 1000).toISOString() }),
    ).rejects.toThrow(/future/u);
  });
});

describe('opening links', () => {
  it('serves a file with the sandbox policy, nosniff and a byte range', async () => {
    const { token } = await create(INSIDE);
    const response = await fetch(`${base}/s/${token}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toBe('sandbox');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toBe(BODY);
    const ranged = await fetch(`${base}/s/${token}`, { headers: { range: 'bytes=4-8' } });
    expect(ranged.status).toBe(206);
    expect(await ranged.text()).toBe('quick');
  });

  it('serves active content as an attachment', async () => {
    const { token } = await create(PAGE);
    const response = await fetch(`${base}/s/${token}`);
    expect(response.headers.get('content-disposition')).toBe('attachment');
    expect(response.headers.get('content-security-policy')).toBe('sandbox');
  });

  it('makes a download link an attachment and a view link inline', async () => {
    const download = await create(INSIDE, { permission: 'download' });
    const view = await create(INSIDE);
    const downloaded = await fetch(`${base}/s/${download.token}`);
    expect(downloaded.headers.get('content-disposition')).toContain('attachment');
    expect(downloaded.headers.get('content-disposition')).toContain('inside.txt');
    expect((await fetch(`${base}/s/${view.token}`)).headers.get('content-disposition')).toBeNull();
  });

  it('answers the same no-longer-available for unknown, malformed, revoked and expired tokens', async () => {
    const revoked = await create(INSIDE);
    shares.revoke(owner, revoked.id);
    expect((await fetch(`${base}/s/${revoked.token}`)).status).toBe(404);
    expect((await fetch(`${base}/s/${'A'.repeat(43)}`)).status).toBe(404);
    expect((await fetch(`${base}/s/short`)).status).toBe(404);
    const expiring = await create(INSIDE, {
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    });
    expect((await fetch(`${base}/s/${expiring.token}`)).status).toBe(200);
    now = new Date(NOW.getTime() + 61_000);
    expect((await fetch(`${base}/s/${expiring.token}`)).status).toBe(404);
  });

  it('revokes immediately and lets only the creator or the owner revoke', async () => {
    updateDriveSettings(opened.store, { membersMayShare: true });
    const made = await create(INSIDE, { actor: member });
    const stranger: DriveActor = {
      profileId: opened.store.profiles.create({ name: 'Ida' }).id,
      owner: false,
    };
    expect(() => shares.revoke(stranger, made.id)).toThrow(/no such share/u);
    expect((await fetch(`${base}/s/${made.token}`)).status).toBe(200);
    shares.revoke(owner, made.id);
    expect((await fetch(`${base}/s/${made.token}`)).status).toBe(404);
  });

  it('says a trashed item is no longer available', async () => {
    const { token } = await create(INSIDE);
    opened.store.driveItems.remove(INSIDE);
    const response = await fetch(`${base}/s/${token}`);
    expect(response.status).toBe(404);
  });

  it('counts opens and downloads once per request from the first byte', async () => {
    const view = await create(INSIDE);
    await (await fetch(`${base}/s/${view.token}`)).arrayBuffer();
    await (await fetch(`${base}/s/${view.token}`, { headers: { range: 'bytes=2-4' } })).text();
    const download = await create(INSIDE, { permission: 'download' });
    await (await fetch(`${base}/s/${download.token}`)).arrayBuffer();
    const viewed = opened.store.driveShares.byId(view.id);
    const downloaded = opened.store.driveShares.byId(download.id);
    expect([viewed.opens, viewed.downloads]).toEqual([1, 0]);
    expect([downloaded.opens, downloaded.downloads]).toEqual([0, 1]);
    expect(viewed.lastOpenedAt).toBe(NOW.toISOString());
  });
});

describe('folder shares', () => {
  it('lists the folder and serves files inside it, including nested ones', async () => {
    const { token } = await create(FOLDER);
    const listing = await fetch(`${base}/s/${token}`);
    expect(listing.status).toBe(200);
    const body = JSON.stringify(await listing.json());
    expect(body).toContain('inside.txt');
    const file = await fetch(`${base}/s/${token}/${INSIDE}`);
    expect(await file.text()).toBe(BODY);
    expect(await (await fetch(`${base}/s/${token}/${NESTED}`)).text()).toBe('nested');
  });

  it('refuses an item outside the shared folder and a path escape', async () => {
    const { token } = await create(FOLDER);
    expect((await fetch(`${base}/s/${token}/${OUTSIDE_FILE}`)).status).toBe(404);
    expect((await fetch(`${base}/s/${token}/..%2Fsecret.txt`)).status).toBe(404);
    expect((await fetch(`${base}/s/${token}/${PHOTO}`)).status).toBe(404);
  });

  it('refuses a folder file whose path now escapes the root through a symlink', async () => {
    const { token } = await create(FOLDER);
    await rm(join(rootDirectory, 'album', 'inside.txt'));
    await writeFile(join(opened.directory, 'beyond.txt'), 'beyond the root');
    await symlink(join(opened.directory, 'beyond.txt'), join(rootDirectory, 'album', 'inside.txt'));
    const response = await fetch(`${base}/s/${token}/${INSIDE}`);
    expect(response.status).toBe(404);
  });
});

describe('password links', () => {
  it('hashes the password with scrypt and never shows it in the stored row', async () => {
    const made = await create(INSIDE, { password: PASSWORD });
    const stored = opened.store.driveShares.byTokenHash(hashToken(made.token));
    expect(stored?.passwordHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/u);
    expect(stored?.passwordHash).not.toContain(PASSWORD);
  });

  it('refuses a bare GET, then serves through the signed url the POST answers', async () => {
    const { token } = await create(INSIDE, { password: PASSWORD });
    expect((await fetch(`${base}/s/${token}`)).status).toBe(401);
    const url = await unlocked(token);
    expect(url).not.toContain(PASSWORD);
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(BODY);
    const ranged = await fetch(url, { headers: { range: 'bytes=0-2' } });
    expect(await ranged.text()).toBe('the');
  });

  it('keeps the password out of every url, query string and log record', async () => {
    const { token } = await create(INSIDE, { password: PASSWORD });
    const url = await unlocked(token);
    await (await fetch(url)).arrayBuffer();
    const query = new URL(url).searchParams;
    expect([...query.keys()].sort()).toEqual(['expires', 'signature']);
    expect(url).not.toContain(PASSWORD);
    expect(JSON.stringify(logs.records)).not.toContain(PASSWORD);
  });

  it('refuses a signature made for another item or another share, and an altered one', async () => {
    const first = await create(FOLDER, { password: PASSWORD });
    const second = await create(FOLDER, { password: PASSWORD });
    const link = new URL(await unlocked(first.token));
    const listed = await (await fetch(link)).json();
    expect(JSON.stringify(listed)).toContain(INSIDE);
    const swappedItem = `${base}/s/${first.token}/${INSIDE}${link.search}`;
    expect((await fetch(swappedItem)).status).toBe(401);
    const swappedShare = `${base}/s/${second.token}${link.search}`;
    expect((await fetch(swappedShare)).status).toBe(401);
    const forged = new URL(link);
    forged.searchParams.set('signature', '0'.repeat(64));
    expect((await fetch(forged)).status).toBe(401);
  });

  it('hands out per-file signed urls in a password folder listing', async () => {
    const { token } = await create(FOLDER, { password: PASSWORD });
    const listing = entriesOf(await (await fetch(await unlocked(token))).json());
    const inside = listing.find((entry) => entry.name === 'inside.txt');
    expect(inside).toBeDefined();
    const response = await fetch(`${base}${inside?.url ?? ''}`);
    expect(await response.text()).toBe(BODY);
  });

  it('expires the signed url after its short lifetime', async () => {
    const { token } = await create(INSIDE, { password: PASSWORD });
    const url = await unlocked(token);
    now = new Date(NOW.getTime() + (LINK_LIFETIME_SECONDS + 1) * 1000);
    expect((await fetch(url)).status).toBe(410);
  });

  it('refuses a wrong password and limits guesses per share', async () => {
    const guarded = await create(INSIDE, { password: PASSWORD });
    const other = await create(INSIDE, { password: PASSWORD });
    for (let attempt = 0; attempt < GUESS_LIMIT; attempt += 1) {
      expect((await unlock(guarded.token, 'wrong')).status).toBe(401);
    }
    expect((await unlock(guarded.token, PASSWORD)).status).toBe(429);
    expect((await unlock(other.token, PASSWORD)).status).toBe(200);
    now = new Date(NOW.getTime() + GUESS_WINDOW_MS + 1);
    expect((await unlock(guarded.token, PASSWORD)).status).toBe(200);
  });

  it('answers a bad body and a passwordless link with a client error', async () => {
    const guarded = await create(INSIDE, { password: PASSWORD });
    const bad = await fetch(`${base}/s/${guarded.token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pass: 'x' }),
    });
    expect(bad.status).toBe(400);
    const open = await create(INSIDE);
    expect((await unlock(open.token, 'anything')).status).toBe(400);
  });
});

describe('logs', () => {
  it('never carry a share token', async () => {
    const made = await create(INSIDE, { password: PASSWORD });
    await unlock(made.token, 'wrong');
    await unlocked(made.token);
    shares.revoke(owner, made.id);
    await fetch(`${base}/s/${made.token}`);
    expect(logs.events()).toContain('drive_share.created');
    expect(logs.events()).toContain('drive_share.password_failed');
    expect(JSON.stringify(logs.records)).not.toContain(made.token);
  });
});

function gpsOf(data: Buffer): boolean {
  return load(data, { expanded: true }).gps !== undefined;
}

async function movieTags(data: Buffer): Promise<string> {
  const path = join(opened.directory, 'received.mov');
  await writeFile(path, data);
  const { stdout } = await run(ffmpegPath(), ['-v', 'error', '-i', path, '-f', 'ffmetadata', '-']);
  return stdout;
}

describe('outside links and location', () => {
  it('serves a JPEG without GPS or XMP location while the setting is on', async () => {
    const original = await readFile(join(FIXTURES, 'exif-full.jpg'));
    expect(gpsOf(original)).toBe(true);
    const { token } = await create(PHOTO);
    const response = await fetch(`${base}/s/${token}`);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(gpsOf(Buffer.from(await response.arrayBuffer()))).toBe(false);
  });

  it('serves a HEIC without GPS while the setting is on', async () => {
    const { token } = await create(HEIC);
    const response = await fetch(`${base}/s/${token}`);
    expect(response.status).toBe(200);
    expect(gpsOf(Buffer.from(await response.arrayBuffer()))).toBe(false);
  });

  it('serves a MOV without its location atoms while the setting is on', async () => {
    const original = await readFile(join(FIXTURES, 'live-photo.mov'));
    expect(await movieTags(original)).toContain('ISO6709');
    const { token } = await create(MOVIE);
    const response = await fetch(`${base}/s/${token}`);
    expect(await movieTags(Buffer.from(await response.arrayBuffer()))).not.toMatch(
      /ISO6709|location/u,
    );
  });

  it('answers a byte range of the stripped copy', async () => {
    const { token } = await create(PHOTO);
    const whole = Buffer.from(await (await fetch(`${base}/s/${token}`)).arrayBuffer());
    const ranged = await fetch(`${base}/s/${token}`, { headers: { range: 'bytes=0-99' } });
    expect(ranged.status).toBe(206);
    expect(Buffer.from(await ranged.arrayBuffer()).equals(whole.subarray(0, 100))).toBe(true);
  });

  it('serves the original bytes when the setting is off', async () => {
    removeLocation = false;
    const original = await readFile(join(FIXTURES, 'exif-full.jpg'));
    const { token } = await create(PHOTO);
    const response = await fetch(`${base}/s/${token}`);
    expect(Buffer.from(await response.arrayBuffer()).equals(original)).toBe(true);
  });
});
