import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { dirname, join } from 'node:path';
import { ApiError, type ComputerNodeRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { versionRelPath } from '../../src/drive/intents';
import type { DriveFiles } from '../../src/server/drive-files';
import {
  driveVersionLink,
  serveDriveVersion,
  type DriveVersionFiles,
} from '../../src/server/drive-version-file';
import { MediaLinks } from '../../src/server/media-links';
import { captureLogs } from '../support/logs';
import type { TestStore } from '../support/store';
import { personalDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore } from '../drive/spaces-fixture';

const NOW = new Date('2026-11-07T00:00:00.000Z');
const STAMP = NOW.toISOString();
const ROOT = '0d000000-0000-4000-8000-000000000013';
const OTHER_ROOT = '0d000000-0000-4000-8000-000000000014';
const FILE = '0d000000-0000-4000-8000-0000000000e2';
const OTHER_FILE = '0d000000-0000-4000-8000-0000000000e3';
const VERSION = '0d000000-0000-4000-8000-0000000000e4';
const OTHER_VERSION = '0d000000-0000-4000-8000-0000000000e5';
const OLD_BODY = 'the slow grey fox';

let opened: TestStore;
let server: Server;
let base = '';
let deps: DriveVersionFiles;
let member: string;
let other: string;

function refuse(): Promise<ComputerNodeRow> {
  throw new ApiError('unauthorized', 'no nodes here');
}

function writeItem(id: string, rootId: string): void {
  opened.store.driveItems.write({
    item: {
      id,
      rootId,
      parentId: null,
      relPath: 'note.txt',
      name: 'note.txt',
      kind: 'document',
      mime: 'text/plain',
      bytes: 19,
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
  });
}

async function keepVersion(
  id: string,
  rootId: string,
  itemId: string,
  body: string,
): Promise<void> {
  const sha256 = createHash('sha256').update(body).digest('hex');
  const root = opened.store.driveRoots.byId(rootId);
  const path = join(root.path, versionRelPath(sha256));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  opened.store.driveVersions.insert(rootId, {
    id,
    itemId,
    rev: 1,
    sha256,
    bytes: body.length,
    at: STAMP,
    purgeAt: '2027-11-07T00:00:00.000Z',
    actorProfileId: null,
    via: 'app',
    deviceId: null,
    addedByProfileId: null,
  });
}

beforeEach(async () => {
  captureLogs();
  opened = await driveTestStore();
  const { store } = opened;
  member = store.profiles.create({ name: 'Robin' }).id;
  other = store.profiles.create({ name: 'Ida' }).id;
  for (const profile of [member, other]) {
    await mkdir(opened.layout.person(profile).drive, { recursive: true });
  }
  store.driveRoots.insert(personalDriveRoot(ROOT, member));
  store.driveRoots.insert(personalDriveRoot(OTHER_ROOT, other));
  writeItem(FILE, ROOT);
  writeItem(OTHER_FILE, OTHER_ROOT);
  await keepVersion(VERSION, ROOT, FILE, OLD_BODY);
  await keepVersion(OTHER_VERSION, OTHER_ROOT, OTHER_FILE, 'private to Ida');
  const links = new MediaLinks(() => NOW);
  const files: DriveFiles = {
    store,
    links,
    nodes: { authenticate: refuse, actorOf: () => ({ profileId: member }) },
    now: (): Date => NOW,
  };
  deps = { files, versions: store.driveVersions };
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://hub');
    const [, , , itemId = '', , versionId = ''] = url.pathname.split('/');
    serveDriveVersion(deps, { request, response, url }, { itemId, versionId }).catch(
      (cause: unknown) => {
        response.writeHead(cause instanceof ApiError ? cause.status : 500).end();
      },
    );
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
  await opened.close();
});

describe('earlier version bytes', () => {
  it('signs a link for a version of a file the caller can read and serves its bytes', async () => {
    const link = driveVersionLink(
      deps,
      { profileId: member },
      { itemId: FILE, versionId: VERSION },
    );
    expect(link.url.startsWith(`/media/drive/${FILE}/versions/${VERSION}?`)).toBe(true);
    const response = await fetch(`${base}${link.url}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(await response.text()).toBe(OLD_BODY);
  });

  it('answers a byte range', async () => {
    const link = driveVersionLink(
      deps,
      { profileId: member },
      { itemId: FILE, versionId: VERSION },
    );
    const response = await fetch(`${base}${link.url}`, { headers: { range: 'bytes=4-7' } });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe('slow');
  });

  it('refuses a version of another person’s file and a version paired with the wrong file', () => {
    expect(() =>
      driveVersionLink(
        deps,
        { profileId: member },
        { itemId: OTHER_FILE, versionId: OTHER_VERSION },
      ),
    ).toThrow(ApiError);
    expect(() =>
      driveVersionLink(deps, { profileId: other }, { itemId: OTHER_FILE, versionId: VERSION }),
    ).toThrow(ApiError);
  });

  it('serves nothing without a signature or for a version of another file', async () => {
    expect((await fetch(`${base}/media/drive/${FILE}/versions/${VERSION}`)).status).toBe(401);
    const signed = deps.files.links.driveVersion(FILE, OTHER_VERSION);
    expect((await fetch(`${base}${signed.url}`)).status).toBe(404);
  });
});
