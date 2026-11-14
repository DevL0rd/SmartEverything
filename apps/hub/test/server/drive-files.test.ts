import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { ApiError, type ComputerNodeRow, type DriveItem } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveActor } from '../../src/drive/access';
import { serveDriveFile, driveFileLink, type DriveFiles } from '../../src/server/drive-files';
import { LINK_LIFETIME_SECONDS, MediaLinks } from '../../src/server/media-links';
import { captureLogs } from '../support/logs';
import type { TestStore } from '../support/store';
import { personalDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore } from '../drive/spaces-fixture';

const NOW = new Date('2026-11-07T00:00:00.000Z');
const STAMP = NOW.toISOString();
const MEMBER_ROOT = '0d000000-0000-4000-8000-000000000003';
const OTHER_ROOT = '0d000000-0000-4000-8000-000000000004';
const OWNER_ROOT = '0d000000-0000-4000-8000-000000000005';
const MEMBER_FILE = '0d000000-0000-4000-8000-0000000000f2';
const OTHER_FILE = '0d000000-0000-4000-8000-0000000000f3';
const OWNER_FILE = '0d000000-0000-4000-8000-0000000000f4';
const BODY = 'the quick brown fox';
const OWNER_TOKEN = 'owner-node';
const MEMBER_TOKEN = 'member-node';
const UNBOUND_TOKEN = 'unbound-node';

let opened: TestStore;
let server: Server;
let base = '';
let now = NOW;
let links: MediaLinks;
let files: DriveFiles;
let ownerProfile: string;
let memberProfile: string;
let otherProfile: string;

function node(deviceId: string): ComputerNodeRow {
  return {
    device_id: deviceId,
    machine_id: '0'.repeat(32),
    hub_url: 'http://hub.local',
    paired_at: STAMP,
    revoked_at: null,
  };
}

const NODES: Readonly<Record<string, string>> = {
  [OWNER_TOKEN]: '0d000000-0000-4000-8000-0000000000a1',
  [MEMBER_TOKEN]: '0d000000-0000-4000-8000-0000000000a2',
  [UNBOUND_TOKEN]: '0d000000-0000-4000-8000-0000000000a3',
};

function actorOf(row: ComputerNodeRow): DriveActor {
  switch (row.device_id) {
    case NODES[OWNER_TOKEN]:
      return { profileId: ownerProfile };
    case NODES[MEMBER_TOKEN]:
      return { profileId: memberProfile };
    default:
      throw new ApiError('forbidden', 'computer_not_bound_to_person');
  }
}

function authenticate(token: string | null): ComputerNodeRow {
  const deviceId = token === null ? undefined : NODES[token];
  if (deviceId === undefined) throw new ApiError('unauthorized', 'unknown or revoked node token');
  return node(deviceId);
}

function writeFileItem(id: string, rootId: string, bytes: number, name = 'note.txt'): DriveItem {
  return opened.store.driveItems.write({
    item: {
      id,
      rootId,
      parentId: null,
      relPath: name,
      name,
      kind: 'document',
      mime: 'text/plain',
      bytes,
      sha256: null,
      integrity: 'unknown',
      thumb: { state: 'none' },
      modifiedAt: STAMP,
      addedAt: STAMP,
      starred: false,
      shared: false,
      outside: false,
      remoteId: null,
      remoteRev: null,
      addedByProfileId: null,
    },
    identity: { dev: '1', ino: id.slice(-4) },
  }).item;
}

function pathOf(url: string): string {
  return `${base}${url}`;
}

beforeEach(async () => {
  captureLogs();
  now = NOW;
  opened = await driveTestStore();
  const { store } = opened;
  ownerProfile = store.profiles.first().id;
  memberProfile = store.profiles.create({ name: 'Robin' }).id;
  otherProfile = store.profiles.create({ name: 'Ida' }).id;
  const memberDirectory = opened.layout.person(memberProfile).drive;
  const otherDirectory = opened.layout.person(otherProfile).drive;
  const ownerDirectory = opened.layout.person(ownerProfile).drive;
  for (const directory of [memberDirectory, otherDirectory, ownerDirectory]) {
    await mkdir(directory, { recursive: true });
  }
  await writeFile(join(memberDirectory, 'note.txt'), BODY);
  await writeFile(join(otherDirectory, 'note.txt'), 'private to Ida');
  await writeFile(join(ownerDirectory, 'note.txt'), 'private to Pat');
  store.driveRoots.insert(personalDriveRoot(MEMBER_ROOT, memberProfile));
  store.driveRoots.insert(personalDriveRoot(OTHER_ROOT, otherProfile));
  store.driveRoots.insert(personalDriveRoot(OWNER_ROOT, ownerProfile));
  writeFileItem(MEMBER_FILE, MEMBER_ROOT, BODY.length);
  writeFileItem(OTHER_FILE, OTHER_ROOT, 14);
  writeFileItem(OWNER_FILE, OWNER_ROOT, 14);
  links = new MediaLinks(() => now);
  files = { store, links, nodes: { authenticate, actorOf }, now: (): Date => now };
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://hub');
    const itemId = url.pathname.split('/')[3] ?? '';
    serveDriveFile(files, { request, response, url }, itemId).catch((cause: unknown) => {
      response.writeHead(cause instanceof ApiError ? cause.status : 500).end();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The test server has no port.');
  base = `http://127.0.0.1:${String(address.port)}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  await opened.close();
});

describe('signed driveFile links', () => {
  it('serves the bytes with the rev in the signed link', async () => {
    const link = links.driveFile(MEMBER_FILE, 1);
    expect(new URL(link.url, 'http://hub').searchParams.get('rev')).toBe('1');
    const response = await fetch(pathOf(link.url));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toBe(BODY);
  });

  it('answers a byte range', async () => {
    const response = await fetch(pathOf(links.driveFile(MEMBER_FILE, 1).url), {
      headers: { range: 'bytes=4-8' },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(`bytes 4-8/${String(BODY.length)}`);
    expect(await response.text()).toBe('quick');
  });

  it('answers 304 to a matching entity tag without reading the file', async () => {
    const url = pathOf(links.driveFile(MEMBER_FILE, 1).url);
    const first = await fetch(url);
    const etag = first.headers.get('etag') ?? '';
    await first.arrayBuffer();
    const again = await fetch(url, { headers: { 'if-none-match': etag } });
    expect(again.status).toBe(304);
  });

  it('refuses a link whose signature was altered', async () => {
    const url = new URL(links.driveFile(MEMBER_FILE, 1).url, 'http://hub');
    url.searchParams.set('signature', '0'.repeat(64));
    expect((await fetch(`${base}${url.pathname}${url.search}`)).status).toBe(401);
  });

  it('refuses a link whose rev was edited without a new signature', async () => {
    const url = new URL(links.driveFile(MEMBER_FILE, 1).url, 'http://hub');
    url.searchParams.set('rev', '2');
    expect((await fetch(`${base}${url.pathname}${url.search}`)).status).toBe(401);
  });

  it('refuses a signature made for another item', async () => {
    const link = links.driveFile(MEMBER_FILE, 1);
    const swapped = link.url.replace(MEMBER_FILE, OTHER_FILE);
    expect((await fetch(pathOf(swapped))).status).toBe(401);
  });

  it('refuses an unsigned request', async () => {
    expect((await fetch(`${base}/media/drive/${MEMBER_FILE}/file`)).status).toBe(401);
  });

  it('refuses an expired link', async () => {
    const url = pathOf(links.driveFile(MEMBER_FILE, 1).url);
    now = new Date(NOW.getTime() + (LINK_LIFETIME_SECONDS + 1) * 1000);
    expect((await fetch(url)).status).toBe(410);
  });

  it('refuses a link for an earlier rev after the file changed', async () => {
    const stale = pathOf(links.driveFile(MEMBER_FILE, 1).url);
    await writeFile(join(opened.layout.person(memberProfile).drive, 'note.txt'), `${BODY} jumps`);
    const changed = writeFileItem(MEMBER_FILE, MEMBER_ROOT, BODY.length + 6);
    expect(changed.rev).toBeGreaterThan(1);
    expect((await fetch(stale)).status).toBe(410);
    const fresh = await fetch(pathOf(links.driveFile(MEMBER_FILE, changed.rev).url));
    expect(await fresh.text()).toBe(`${BODY} jumps`);
  });

  it('caches per URL only until the link expires, not forever', async () => {
    now = new Date(NOW.getTime() + 100 * 1000);
    const link = links.driveFile(MEMBER_FILE, 1);
    now = new Date(NOW.getTime() + 400 * 1000);
    const response = await fetch(pathOf(link.url));
    const remaining = LINK_LIFETIME_SECONDS - 300;
    expect(response.headers.get('cache-control')).toBe(
      `private, max-age=${String(remaining)}, immutable`,
    );
    await response.arrayBuffer();
  });

  it('gives every person links only to items they may see, the owner included', () => {
    const member: DriveActor = { profileId: memberProfile };
    const owner: DriveActor = { profileId: ownerProfile };
    expect(driveFileLink(files, member, MEMBER_FILE).url).toContain('/file?');
    expect(() => driveFileLink(files, member, OTHER_FILE)).toThrow(/no such file/);
    expect(() => driveFileLink(files, owner, OTHER_FILE)).toThrow(/no such file/);
    expect(driveFileLink(files, owner, OWNER_FILE).url).toContain(OWNER_FILE);
  });

  it('signs a thumb link with the rev and the size in the path', () => {
    const link = links.driveThumb(MEMBER_FILE, 'thumb', 3);
    expect(link.url).toContain(`/media/drive/${MEMBER_FILE}/thumb/thumb?`);
    const verified = links.verifyDrive(new URL(link.url, 'http://hub'));
    expect(verified.rev).toBe(3);
  });
});

describe('driveFile with a computer node token', () => {
  const bearer = (token: string): Record<string, string> => ({
    authorization: `Bearer ${token}`,
  });
  const route = `/media/drive/${MEMBER_FILE}/file`;

  it('serves the owner node the item of the owner with Range', async () => {
    const response = await fetch(`${base}/media/drive/${OWNER_FILE}/file`, {
      headers: { ...bearer(OWNER_TOKEN), range: 'bytes=0-6' },
    });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe('private');
    expect(response.headers.get('cache-control')).toBe('private, no-cache');
  });

  it('hides another person item from the owner node', async () => {
    const response = await fetch(`${base}/media/drive/${OTHER_FILE}/file`, {
      headers: bearer(OWNER_TOKEN),
    });
    expect(response.status).toBe(404);
  });

  it('serves a member node its own root', async () => {
    const response = await fetch(`${base}${route}`, { headers: bearer(MEMBER_TOKEN) });
    expect(await response.text()).toBe(BODY);
  });

  it('hides another person root from a member node', async () => {
    const response = await fetch(`${base}/media/drive/${OTHER_FILE}/file`, {
      headers: bearer(MEMBER_TOKEN),
    });
    expect(response.status).toBe(404);
  });

  it('refuses a node bound to no person', async () => {
    expect((await fetch(`${base}${route}`, { headers: bearer(UNBOUND_TOKEN) })).status).toBe(403);
  });

  it('refuses an unknown or revoked token and ignores a valid signature beside it', async () => {
    const signed = pathOf(links.driveFile(MEMBER_FILE, 1).url);
    const response = await fetch(signed, { headers: bearer('revoked-node') });
    expect(response.status).toBe(401);
  });
});
