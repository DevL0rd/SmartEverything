import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  DRIVE_UPLOAD_METADATA,
  type DriveItem,
  type DriveUploadTarget,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { commitContent, folderDraft, recordItem, type ChangeEnv } from '../../src/drive/changes';
import type { DriveWriteRoot } from '../../src/drive/intents';
import { updateDriveSettings } from '../../src/drive/settings';
import { TusUploads, type TusEnv } from '../../src/drive/uploads-tus';
import {
  writeAtPosition,
  type PositionalWrite,
  type TusCaller,
} from '../../src/drive/uploads-tus-wire';
import { isMissing } from '../../src/fs-util';
import { nodeFiles, stageBytes } from '../../src/drive/versions';
import { BackupService } from '../../src/photos/backup';
import { DriveBackupRepository } from '../../src/store/repositories/drive-backup';
import { captureLogs, testLogger } from '../support/logs';
import type { TestStore } from '../support/store';
import { personalDriveRoot, sharedDriveRoot } from '../store/drive-roots-fixture';
import { driveTestStore } from './spaces-fixture';

const START = new Date('2026-11-07T00:00:00.000Z');
const DAY_MS = 86_400_000;
const OFFSET_STREAM = 'application/offset+octet-stream';

let opened: TestStore;
let base = '';
let dir = '';
let clock = START;
let root: DriveWriteRoot;
let folderId = '';
let owner = '';
let robin = '';
let sam = '';
let server: http.Server;
let origin = '';
let nextIno = 1;
let callers: Map<string, TusCaller>;

const sha = (text: string): string =>
  Buffer.from(createHash('sha256').update(text).digest()).toString('base64');
const b64 = (text: string): string => Buffer.from(text).toString('base64');

function changeEnv(): ChangeEnv {
  return {
    files: nodeFiles,
    store: opened.store,
    log: testLogger('drive'),
    now: () => clock,
    purge: { rearm: (): void => undefined },
  };
}

function caller(profileId: string, clientId: string): TusCaller {
  return { profileId, clientId, nodeId: null };
}

async function startServer(
  writeAt: PositionalWrite = writeAtPosition,
  completed: (item: DriveItem) => void = (): void => undefined,
): Promise<TusUploads> {
  const env: TusEnv = {
    ...changeEnv(),
    store: opened.store,
    completed,
    space: () => Promise.resolve({ totalBytes: 1e12, freeBytes: 1e12 }),
    authenticate: (request) => {
      const token = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1] ?? '';
      return callers.get(token) ?? null;
    },
  };
  const uploads = new TusUploads(env, writeAt);
  server = http.createServer((request, response) => {
    void uploads.handle(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`;
  return uploads;
}

function headers(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Tus-Resumable': '1.0.0', ...extra };
}

function patchHeaders(
  token: string,
  offset: number,
  extra: Record<string, string> = {},
): Record<string, string> {
  return headers(token, {
    'Content-Type': OFFSET_STREAM,
    'Upload-Offset': String(offset),
    ...extra,
  });
}

function wireMetadata(target: DriveUploadTarget, name = 'a.txt', sha256?: string): string {
  const record = DRIVE_UPLOAD_METADATA.parse({
    filename: name,
    filetype: 'image/jpeg',
    ...(target.kind === 'folder'
      ? { targetKind: 'folder', folderId: target.folderId }
      : { targetKind: 'item', itemId: target.itemId, baseRev: String(target.baseRev) }),
    ...(sha256 === undefined ? {} : { sha256 }),
  });
  return Object.entries(record)
    .map(([key, value]) => `${key} ${b64(z.string().parse(value))}`)
    .join(',');
}

function metadata(name: string, target: string = folderId): string {
  return wireMetadata({ kind: 'folder', folderId: target }, name);
}

async function create(
  length: number,
  name = 'a.txt',
  token = 'robin',
  extra: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${origin}/drive/uploads`, {
    method: 'POST',
    headers: headers(token, {
      'Upload-Length': String(length),
      'Upload-Metadata': metadata(name),
      ...extra,
    }),
  });
}

async function open(length: number, name = 'a.txt', token = 'robin'): Promise<string> {
  const response = await create(length, name, token);
  expect(response.status).toBe(201);
  return `${origin}${response.headers.get('location') ?? ''}`;
}

async function head(location: string, token = 'robin'): Promise<Response> {
  return fetch(location, { method: 'HEAD', headers: headers(token) });
}

async function patch(
  location: string,
  offset: number,
  body: string,
  as: { readonly extra?: Record<string, string>; readonly token?: string } = {},
): Promise<Response> {
  return fetch(location, {
    method: 'PATCH',
    headers: patchHeaders(as.token ?? 'robin', offset, as.extra),
    body,
  });
}

async function tmpFiles(): Promise<string[]> {
  try {
    return await readdir(join(dir, '.smarteverything', 'tmp'));
  } catch (cause) {
    if (isMissing(cause)) return [];
    throw cause;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (cause) {
    if (isMissing(cause)) return false;
    throw cause;
  }
}

function idOf(location: string): string {
  return location.split('/').at(-1) ?? '';
}

function stream(text: string): Readable {
  return Readable.from([Buffer.from(text)]);
}

async function interrupted(location: string, payload: Buffer, sent: number): Promise<void> {
  const url = new URL(location);
  const socket = net.connect(Number(url.port), url.hostname);
  await new Promise((resolve) => socket.once('connect', resolve));
  socket.write(
    `PATCH ${url.pathname} HTTP/1.1\r\nHost: ${url.host}\r\nAuthorization: Bearer robin\r\nTus-Resumable: 1.0.0\r\nContent-Type: ${OFFSET_STREAM}\r\nUpload-Offset: 0\r\nContent-Length: ${String(payload.length)}\r\n\r\n`,
  );
  socket.write(payload.subarray(0, sent));
  await new Promise((resolve) => setTimeout(resolve, 150));
  socket.destroy();
  await new Promise((resolve) => setTimeout(resolve, 150));
}

function registeredBackup(): { readonly service: BackupService; readonly phoneId: string } {
  opened.store.driveRoots.insert(personalDriveRoot(randomUUID(), robin));
  const backups = new DriveBackupRepository(opened.store.context);
  const service = new BackupService({
    ...changeEnv(),
    store: { ...opened.store, driveBackup: backups },
    sql: opened.store.context.sql,
  });
  const [phone] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: 'backup-phone',
      parentId: null,
      kind: 'phone',
      name: 'Phone',
      model: 'Fake',
      manufacturer: 'Fake',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (phone === undefined) throw new Error('missing fake phone');
  service.registerDevice(robin, {
    deviceId: phone.id,
    name: 'Phone',
    platform: 'android',
    settings: {
      enabled: true,
      folders: ['Camera'],
      wifiOnly: true,
      chargingOnly: false,
      includeVideos: true,
    },
  });
  return { service, phoneId: phone.id };
}

beforeEach(async () => {
  captureLogs();
  clock = START;
  opened = await driveTestStore();
  base = await realpath(await mkdtemp(join(tmpdir(), 'hub-drive-uploads-')));
  dir = opened.layout.home.drive;
  await mkdir(join(dir, 'Uploads'), { recursive: true });
  const rootId = randomUUID();
  root = { id: rootId, path: dir, versions: true };
  opened.store.driveRoots.insert(sharedDriveRoot(rootId));
  owner = opened.store.profiles.first().id;
  robin = opened.store.profiles.create({ name: 'Robin' }).id;
  sam = opened.store.profiles.create({ name: 'Sam' }).id;
  const client = (name: string, hash: string): string =>
    opened.store.clients.create({
      name,
      platform: 'android',
      role: 'member',
      tokenHash: hash.repeat(64),
    }).id;
  callers = new Map([
    ['owner', { profileId: owner, clientId: client('Owner', 'a'), nodeId: null }],
    ['robin', caller(robin, client('Robin tablet', 'b'))],
    ['robin-phone', caller(robin, client('Robin phone', 'c'))],
    ['sam', caller(sam, client('Sam phone', 'd'))],
  ]);
  const folder = recordItem(changeEnv(), {
    draft: folderDraft(
      {
        rootId,
        parentId: null,
        relPath: 'Uploads',
        modifiedAt: START.toISOString(),
        addedAt: START.toISOString(),
        outside: false,
        addedByProfileId: null,
      },
      0,
    ),
    identity: { dev: '1', ino: String(nextIno++) },
    op: 'create',
    actor: { actorProfileId: null, via: 'app', deviceId: null },
  });
  folderId = folder.id;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await opened.close();
  await rm(base, { recursive: true, force: true });
});

describe('creating and completing an upload', () => {
  it('advertises the supported extensions on OPTIONS and refuses an anonymous caller', async () => {
    await startServer();
    const options = await fetch(`${origin}/drive/uploads`, {
      method: 'OPTIONS',
      headers: headers('robin'),
    });
    expect(options.status).toBe(204);
    expect(options.headers.get('tus-extension')).toBe('creation,checksum,termination,expiration');
    expect(options.headers.get('tus-checksum-algorithm')).toBe('sha256');
    const anonymous = await fetch(`${origin}/drive/uploads`, { method: 'POST' });
    expect(anonymous.status).toBe(401);
    expect(
      (
        await fetch(`${origin}/drive/uploads`, {
          method: 'POST',
          headers: { Authorization: 'Bearer robin' },
        })
      ).status,
    ).toBe(412);
  });

  it('commits the finished bytes into the folder as the uploader', async () => {
    await startServer();
    const location = await open(10);
    expect((await head(location)).headers.get('upload-offset')).toBe('0');
    const response = await patch(location, 0, '0123456789');
    expect(response.status).toBe(204);
    expect(response.headers.get('upload-offset')).toBe('10');
    expect(await readFile(join(dir, 'Uploads', 'a.txt'), 'utf8')).toBe('0123456789');
    const item = opened.store.driveItems.byPath(root.id, 'Uploads/a.txt', null);
    expect(item?.kind === 'folder' ? null : item?.bytes).toBe(10);
    expect(item?.addedByProfileId).toBe(robin);
    expect(response.headers.get('upload-item-id')).toBe(item?.id);
    expect(response.headers.get('upload-item-name')).toBe('a.txt');
    const resumed = await head(location);
    expect(resumed.headers.get('upload-item-id')).toBe(item?.id);
    expect(resumed.headers.get('upload-item-name')).toBe('a.txt');
    expect(opened.store.driveUploads.byId(idOf(location)).state).toBe('complete');
    expect(await tmpFiles()).toEqual([]);
  });

  it('names a clash "Name (2)" and then "Name (3)"', async () => {
    await startServer();
    for (const expected of ['a.txt', 'a (2).txt', 'a (3).txt']) {
      const location = await open(3);
      const completed = await patch(location, 0, 'abc');
      expect(completed.status).toBe(204);
      expect(completed.headers.get('upload-item-name')).toBe(encodeURIComponent(expected));
      expect((await head(location)).headers.get('upload-item-id')).toBe(
        completed.headers.get('upload-item-id'),
      );
      expect(await exists(join(dir, 'Uploads', expected))).toBe(true);
    }
  });

  it('commits an empty file at creation', async () => {
    await startServer();
    const response = await create(0, 'empty.txt');
    expect(response.status).toBe(201);
    expect(await readFile(join(dir, 'Uploads', 'empty.txt'), 'utf8')).toBe('');
    expect(response.headers.get('upload-item-id')).toBe(
      opened.store.driveItems.byPath(root.id, 'Uploads/empty.txt', null)?.id,
    );
    expect(opened.store.driveUploads.byId(idOf(response.headers.get('location') ?? '')).state).toBe(
      'complete',
    );
  });

  it('replaces an item only at its base rev and keeps the old bytes as a version', async () => {
    await startServer();
    const staged = await stageBytes(changeEnv(), root, stream('old'));
    const written = await commitContent(changeEnv(), {
      root,
      staged,
      relPath: 'Uploads/doc.txt',
      actor: { actorProfileId: robin, via: 'app', deviceId: null },
    });
    const target = (baseRev: number): string =>
      wireMetadata({ kind: 'item', itemId: written.item.id, baseRev }, 'doc.txt');
    const stale = await fetch(`${origin}/drive/uploads`, {
      method: 'POST',
      headers: headers('robin', {
        'Upload-Length': '3',
        'Upload-Metadata': target(written.item.rev + 1),
      }),
    });
    expect(stale.status).toBe(409);
    const fresh = await fetch(`${origin}/drive/uploads`, {
      method: 'POST',
      headers: headers('robin', {
        'Upload-Length': '3',
        'Upload-Metadata': target(written.item.rev),
      }),
    });
    expect(fresh.status).toBe(201);
    const location = `${origin}${fresh.headers.get('location') ?? ''}`;
    expect((await patch(location, 0, 'new')).status).toBe(204);
    expect(await readFile(join(dir, 'Uploads', 'doc.txt'), 'utf8')).toBe('new');
    expect(opened.store.driveVersions.findRev(written.item.id, written.item.rev)).toBeDefined();
  });

  it('refuses a replacement when the file changed after the upload began', async () => {
    await startServer();
    const staged = await stageBytes(changeEnv(), root, stream('old'));
    const written = await commitContent(changeEnv(), {
      root,
      staged,
      relPath: 'Uploads/doc.txt',
      actor: { actorProfileId: robin, via: 'app', deviceId: null },
    });
    const fresh = await fetch(`${origin}/drive/uploads`, {
      method: 'POST',
      headers: headers('robin', {
        'Upload-Length': '3',
        'Upload-Metadata': wireMetadata(
          { kind: 'item', itemId: written.item.id, baseRev: written.item.rev },
          'doc.txt',
        ),
      }),
    });
    const location = `${origin}${fresh.headers.get('location') ?? ''}`;
    const later = await stageBytes(changeEnv(), root, stream('later'));
    await commitContent(changeEnv(), {
      root,
      staged: later,
      relPath: 'Uploads/doc.txt',
      actor: { actorProfileId: robin, via: 'app', deviceId: null },
    });
    expect((await patch(location, 0, 'new')).status).toBe(409);
    expect(await readFile(join(dir, 'Uploads', 'doc.txt'), 'utf8')).toBe('later');
    expect(opened.store.driveUploads.byId(idOf(location)).state).toBe('failed');
    expect(await tmpFiles()).toEqual([]);
  });
});

describe('resuming', () => {
  it('reports the partial offset by HEAD after a killed client and finishes from it', async () => {
    await startServer();
    const payload = Buffer.alloc(2_000_000, 7);
    const location = await open(payload.length, 'big.bin');
    await interrupted(location, payload, 600_000);
    const offset = Number((await head(location)).headers.get('upload-offset'));
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(payload.length);
    expect(opened.store.driveUploads.byId(idOf(location)).offset).toBe(offset);
    const rest = await fetch(location, {
      method: 'PATCH',
      headers: patchHeaders('robin', offset),
      body: payload.subarray(offset),
    });
    expect(rest.status).toBe(204);
    const stored = await readFile(join(dir, 'Uploads', 'big.bin'));
    expect(createHash('sha256').update(stored).digest('hex')).toBe(
      createHash('sha256').update(payload).digest('hex'),
    );
  });

  it('commits a fully received partial on HEAD and returns its durable receipt', async () => {
    await startServer();
    const location = await open(3, 'resumed.jpg');
    await writeFile(join(dir, '.smarteverything', 'tmp', idOf(location)), 'abc');
    const resumed = await head(location);
    expect(resumed.status).toBe(200);
    expect(resumed.headers.get('upload-offset')).toBe('3');
    const item = opened.store.driveItems.byPath(root.id, 'Uploads/resumed.jpg', null);
    expect(resumed.headers.get('upload-item-id')).toBe(item?.id);
    expect((await head(location)).headers.get('upload-item-id')).toBe(item?.id);
    expect(await readFile(join(dir, 'Uploads', 'resumed.jpg'), 'utf8')).toBe('abc');
  });

  it('requires a fresh upload for an old completion with no receipt and preserves its file', async () => {
    await startServer();
    const location = await open(3);
    expect((await patch(location, 0, 'abc')).status).toBe(204);
    opened.store.context.sql.run(
      'simulate a pre-receipt completion',
      'delete from drive_upload_results where upload_id = $id',
      { id: idOf(location) },
    );
    expect((await head(location)).status).toBe(410);
    expect(await readFile(join(dir, 'Uploads', 'a.txt'), 'utf8')).toBe('abc');
    for (const token of ['sam', 'robin-phone', 'owner']) {
      expect((await head(location, token)).status).toBe(404);
    }
  });

  it('verifies the persisted whole-file hash before committing a resumed full partial', async () => {
    await startServer();
    const expected = createHash('sha256').update('photo').digest('hex');
    const created = await create(5, 'resume.jpg', 'robin', {
      'Upload-Metadata': wireMetadata({ kind: 'folder', folderId }, 'resume.jpg', expected),
    });
    const location = `${origin}${created.headers.get('location') ?? ''}`;
    expect(opened.store.driveUploads.expectedHash(idOf(location))).toBe(expected);
    await writeFile(join(dir, '.smarteverything', 'tmp', idOf(location)), 'other');
    expect((await head(location)).status).toBe(460);
    expect(opened.store.driveItems.byPath(root.id, 'Uploads/resume.jpg', null)).toBeUndefined();
    expect(opened.store.driveUploads.byId(idOf(location)).state).toBe('failed');
    expect(opened.store.driveUploads.result(idOf(location))).toBeUndefined();
  });

  it('answers 409 on an offset mismatch and 413 past the declared length', async () => {
    await startServer();
    const location = await open(10);
    expect((await patch(location, 3, 'abc')).status).toBe(409);
    expect((await patch(location, 0, 'far too long for ten')).status).toBe(413);
    expect((await head(location)).headers.get('upload-offset')).toBe('0');
  });

  it('answers 415 for a wrong content type', async () => {
    await startServer();
    const location = await open(3);
    const response = await fetch(location, {
      method: 'PATCH',
      headers: headers('robin', { 'Content-Type': 'text/plain', 'Upload-Offset': '0' }),
      body: 'abc',
    });
    expect(response.status).toBe(415);
  });

  it('refuses a second PATCH while the first is still open', async () => {
    await startServer();
    const location = await open(1000);
    const url = new URL(location);
    const socket = net.connect(Number(url.port), url.hostname);
    await new Promise((resolve) => socket.once('connect', resolve));
    socket.write(
      `PATCH ${url.pathname} HTTP/1.1\r\nHost: ${url.host}\r\nAuthorization: Bearer robin\r\nTus-Resumable: 1.0.0\r\nContent-Type: ${OFFSET_STREAM}\r\nUpload-Offset: 0\r\nContent-Length: 500\r\n\r\nabc`,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await patch(location, 0, 'xyz')).status).toBe(409);
    expect((await fetch(location, { method: 'DELETE', headers: headers('robin') })).status).toBe(
      409,
    );
    socket.destroy();
  });
});

describe('checksum', () => {
  it('accepts a correct sha256 and rejects a wrong one with 460, keeping the offset', async () => {
    await startServer();
    const location = await open(5);
    const wrong = await patch(location, 0, 'hello', {
      extra: { 'Upload-Checksum': `sha256 ${sha('other')}` },
    });
    expect(wrong.status).toBe(460);
    expect((await head(location)).headers.get('upload-offset')).toBe('0');
    const right = await patch(location, 0, 'hello', {
      extra: { 'Upload-Checksum': `sha256 ${sha('hello')}` },
    });
    expect(right.status).toBe(204);
  });

  it('answers 400 for an unsupported algorithm', async () => {
    await startServer();
    const location = await open(5);
    const response = await patch(location, 0, 'hello', {
      extra: { 'Upload-Checksum': `md5 ${b64('x')}` },
    });
    expect(response.status).toBe(400);
  });
});

describe('ownership and scope', () => {
  it('answers 404 to HEAD, PATCH and DELETE from another profile or another client', async () => {
    await startServer();
    const location = await open(5);
    for (const token of ['sam', 'robin-phone', 'owner']) {
      expect((await head(location, token)).status).toBe(404);
      expect((await patch(location, 0, 'hello', { token })).status).toBe(404);
      expect((await fetch(location, { method: 'DELETE', headers: headers(token) })).status).toBe(
        404,
      );
    }
    expect((await head(location)).status).toBe(200);
  });

  async function personalFolder(): Promise<DriveItem> {
    const personal = randomUUID();
    const personalDir = opened.layout.person(robin).drive;
    await mkdir(join(personalDir, 'Mine'), { recursive: true });
    opened.store.driveRoots.insert(personalDriveRoot(personal, robin));
    return recordItem(changeEnv(), {
      draft: folderDraft(
        {
          rootId: personal,
          parentId: null,
          relPath: 'Mine',
          modifiedAt: START.toISOString(),
          addedAt: START.toISOString(),
          outside: false,
          addedByProfileId: null,
        },
        0,
      ),
      identity: { dev: '1', ino: String(nextIno++) },
      op: 'create',
      actor: { actorProfileId: null, via: 'app', deviceId: null },
    });
  }

  function uploadInto(token: string, folderId: string): Promise<Response> {
    return fetch(`${origin}/drive/uploads`, {
      method: 'POST',
      headers: headers(token, {
        'Upload-Length': '3',
        'Upload-Metadata': metadata('a.txt', folderId),
      }),
    });
  }

  it('hides a personal drive and its folders from every other profile, the owner included', async () => {
    await startServer();
    const folder = await personalFolder();
    expect((await uploadInto('sam', folder.id)).status).toBe(404);
    expect((await uploadInto('owner', folder.id)).status).toBe(404);
    expect((await uploadInto('robin', folder.id)).status).toBe(201);
  });

  it('lets an edit grant upload into the shared folder and refuses a view grant', async () => {
    await startServer();
    const folder = await personalFolder();
    opened.store.driveGrants.set({ itemId: folder.id, profileId: sam, role: 'view' }, robin);
    expect((await uploadInto('sam', folder.id)).status).toBe(403);
    opened.store.driveGrants.set({ itemId: folder.id, profileId: sam, role: 'edit' }, robin);
    expect((await uploadInto('sam', folder.id)).status).toBe(201);
    expect((await uploadInto('owner', folder.id)).status).toBe(404);
  });

  it('refuses metadata that does not name a target', async () => {
    await startServer();
    const response = await fetch(`${origin}/drive/uploads`, {
      method: 'POST',
      headers: headers('robin', {
        'Upload-Length': '3',
        'Upload-Metadata': `name ${b64('a.txt')}`,
      }),
    });
    expect(response.status).toBe(400);
  });
});

describe('quota and free space', () => {
  it('refuses an over-quota upload at creation without leaving a file', async () => {
    await startServer();
    opened.store.driveQuotas.set(robin, 5);
    const response = await create(10);
    expect(response.status).toBe(413);
    expect(await tmpFiles()).toEqual([]);
    expect((await create(4)).status).toBe(201);
  });

  it('checks the quota again at commit and fails the session', async () => {
    await startServer();
    const location = await open(10);
    opened.store.driveQuotas.set(robin, 5);
    expect((await patch(location, 0, '0123456789')).status).toBe(413);
    expect(opened.store.driveUploads.byId(idOf(location)).state).toBe('failed');
    expect(await tmpFiles()).toEqual([]);
    expect(await exists(join(dir, 'Uploads', 'a.txt'))).toBe(false);
  });

  it('refuses an upload that does not fit the free space', async () => {
    const env: TusEnv = {
      ...changeEnv(),
      store: opened.store,
      completed: (): void => undefined,
      space: () => Promise.resolve({ totalBytes: 100, freeBytes: 5 }),
      authenticate: () => callers.get('robin') ?? null,
    };
    const uploads = new TusUploads(env);
    server = http.createServer((request, response) => {
      void uploads.handle(request, response);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    origin = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`;
    expect((await create(10)).status).toBe(507);
    expect((await create(4)).status).toBe(201);
  });

  it('removes the partial file, fails the session and answers no-space on ENOSPC during PATCH', async () => {
    let writes = 0;
    await startServer((handle, chunk, position) => {
      writes += 1;
      if (writes > 1) {
        return Promise.reject(
          Object.assign(new Error('no space left on device'), { code: 'ENOSPC' }),
        );
      }
      return writeAtPosition(handle, chunk, position);
    });
    const payload = Buffer.alloc(300_000, 1);
    const location = await open(payload.length);
    const response = await fetch(location, {
      method: 'PATCH',
      headers: patchHeaders('robin', 0),
      body: Readable.toWeb(
        Readable.from([payload.subarray(0, 150_000), payload.subarray(150_000)]),
      ),
      duplex: 'half',
    });
    expect(response.status).toBe(507);
    expect(await tmpFiles()).toEqual([]);
    expect(opened.store.driveUploads.byId(idOf(location)).state).toBe('failed');
    expect((await head(location)).status).toBe(404);
  });

  it('removes the partial file and fails the session on ENOSPC during commit', async () => {
    const failing: ChangeEnv = {
      ...changeEnv(),
      files: {
        ...nodeFiles,
        rename: () => Promise.reject(Object.assign(new Error('no space'), { code: 'ENOSPC' })),
      },
    };
    const env: TusEnv = {
      ...failing,
      store: opened.store,
      completed: (): void => undefined,
      space: () => Promise.resolve({ totalBytes: 1e12, freeBytes: 1e12 }),
      authenticate: () => callers.get('robin') ?? null,
    };
    const uploads = new TusUploads(env);
    server = http.createServer((request, response) => {
      void uploads.handle(request, response);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    origin = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`;
    const location = await open(3);
    expect((await patch(location, 0, 'abc')).status).toBe(507);
    expect(await tmpFiles()).toEqual([]);
    expect(opened.store.driveUploads.byId(idOf(location)).state).toBe('failed');
  });
});

describe('expiry and termination', () => {
  it('expires an open upload after the configured days and sweeps its file', async () => {
    const uploads = await startServer();
    updateDriveSettings(opened.store, { uploadExpiryDays: 2 });
    const created = await create(5);
    const location = `${origin}${created.headers.get('location') ?? ''}`;
    expect(new Date(created.headers.get('upload-expires') ?? '').getTime()).toBe(
      START.getTime() + 2 * DAY_MS,
    );
    expect(uploads.soonestExpiry()).toBe(new Date(START.getTime() + 2 * DAY_MS).toISOString());
    expect(await uploads.sweepExpired()).toBe(0);
    clock = new Date(START.getTime() + 2 * DAY_MS + 1);
    expect((await head(location)).status).toBe(404);
    expect((await patch(location, 0, 'hello')).status).toBe(404);
    expect(await uploads.sweepExpired()).toBe(1);
    expect(await tmpFiles()).toEqual([]);
    expect(opened.store.driveUploads.byId(idOf(location)).state).toBe('expired');
    expect(await uploads.sweepExpired()).toBe(0);
  });

  it('terminates an upload and removes its file and row', async () => {
    await startServer();
    const location = await open(5);
    expect((await patch(location, 0, 'he')).status).toBe(204);
    expect((await fetch(location, { method: 'DELETE', headers: headers('robin') })).status).toBe(
      204,
    );
    expect((await head(location)).status).toBe(404);
    expect(await tmpFiles()).toEqual([]);
    expect(opened.store.driveUploads.find(idOf(location))).toBeUndefined();
  });
});

describe('recovery of the partial file', () => {
  it('fails the session and answers 404 when the partial file vanished', async () => {
    await startServer();
    const location = await open(5);
    await rm(join(dir, '.smarteverything', 'tmp', idOf(location)));
    expect((await head(location)).status).toBe(404);
    expect(opened.store.driveUploads.byId(idOf(location)).state).toBe('failed');
  });
});

describe('camera roll backup through tus', () => {
  it('settles the actual committed hash and repeats a backup without sending bytes', async () => {
    const { service, phoneId } = registeredBackup();
    const assets = [
      { localId: 'content://photo', sha256: createHash('sha256').update('photo').digest('hex') },
    ];
    expect(service.checkHashes(robin, { deviceId: phoneId, assets }).missing).toEqual([
      'content://photo',
    ]);
    await startServer(writeAtPosition, (item): void => {
      service.settleItem(item);
    });
    const location = await open(5, 'photo.jpg');
    const rejected = await patch(location, 0, 'other', {
      extra: { 'Upload-Checksum': `sha256 ${sha('photo')}` },
    });
    expect(rejected.status).toBe(460);
    expect(service.state(robin)[0]?.backedUp).toBe(0);
    const response = await patch(location, 0, 'photo', {
      extra: { 'Upload-Checksum': `sha256 ${sha('photo')}` },
    });
    expect(response.status).toBe(204);
    const itemId = response.headers.get('upload-item-id');
    expect(service.state(robin)[0]).toMatchObject({ backedUp: 1, uploading: 0 });
    expect(service.checkHashes(robin, { deviceId: phoneId, assets })).toEqual({
      have: [{ localId: 'content://photo', itemId }],
      missing: [],
    });
    const resumed = await head(location);
    expect(resumed.headers.get('upload-offset')).toBe('5');
    expect(resumed.headers.get('upload-item-id')).toBe(itemId);
    expect(await readFile(join(dir, 'Uploads', 'photo.jpg'), 'utf8')).toBe('photo');
  });
});
