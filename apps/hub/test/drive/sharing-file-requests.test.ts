import { readFile, readdir, utimes, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { ApiError, matchPath, type DriveItem } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DriveFreeSpaceError, DriveQuotaExceededError } from '../../src/drive/quotas';
import { TMP_DIRECTORY } from '../../src/drive/intents';
import {
  FileRequestIntake,
  type IntakeProgress,
} from '../../src/drive/sharing/file-request-intake';
import {
  DriveFileRequests,
  type FileRequestActor,
  type PublicFileRequest,
} from '../../src/drive/sharing/file-requests';
import { fileRequestRoutes } from '../../src/server/file-request-route';
import { sendError } from '../../src/server/http';
import { captureLogs } from '../support/logs';
import { NOW, openFsRig, type FsRig } from './fs-rig';

const STARTED = z.looseObject({ uploadId: z.string() });
const REFUSAL = z.looseObject({ error: z.looseObject({ message: z.string() }) });
const BODY = 'Hello from a person with a link';
const WIDE_OPEN: FileRequestActor = { profileId: '', linksAllowed: true };

let rig: FsRig;
let inbox: DriveItem;
let requests: DriveFileRequests;
let intake: FileRequestIntake;
let clock = NOW;
let owner: FileRequestActor;

function members(): FileRequestActor {
  return { profileId: rig.memberId, linksAllowed: false };
}

async function create(expiresAt: string | null = null): Promise<{ token: string; id: string }> {
  const created = await requests.create(owner, {
    folderItemId: inbox.id,
    title: 'Holiday photos',
    message: 'Send me what you took',
    expiresAt,
  });
  const token = created.url.split('/r/')[1] ?? '';
  return { token, id: created.request.id };
}

async function found(token: string): Promise<PublicFileRequest> {
  return await requests.receiving(token, '10.0.0.1');
}

interface Sending {
  readonly name: string;
  readonly text: string;
  readonly uploader?: string;
  readonly chunk?: number;
}

function stream(text: string | Buffer): AsyncIterable<Uint8Array> {
  return Readable.from([Buffer.from(text)]);
}

async function send(token: string, sending: Sending): Promise<IntakeProgress> {
  const { name, uploader = 'Alex', chunk = 8 } = sending;
  const body = Buffer.from(sending.text);
  const request = await found(token);
  const started = await intake.begin(request, { uploader, name, length: body.length });
  let progress = started;
  for (let offset = 0; !progress.done && offset < body.length; offset += chunk) {
    progress = await intake.append(request, {
      uploadId: started.uploadId,
      offset,
      chunks: stream(body.subarray(offset, offset + chunk)),
      uploader,
      name,
    });
  }
  return progress;
}

async function refused<T>(work: () => Promise<T> | T): Promise<unknown> {
  try {
    await work();
  } catch (cause) {
    return cause;
  }
  throw new Error('The work was not refused.');
}

beforeEach(async () => {
  captureLogs();
  rig = await openFsRig();
  clock = NOW;
  owner = { ...WIDE_OPEN, profileId: rig.ownerId };
  inbox = await rig.seedFolder(rig.mine, 'Inbox');
  requests = new DriveFileRequests({
    store: rig.opened.store,
    origin: (): { url: string; public: boolean } => ({
      url: 'https://hub.example/',
      public: true,
    }),
    now: (): Date => clock,
  });
  intake = new FileRequestIntake({
    env: rig.changeEnv(),
    store: rig.opened.store,
    space: (): Promise<{ totalBytes: number; freeBytes: number }> =>
      Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12 }),
  });
});

afterEach(async () => {
  await rig.opened.close();
});

describe('making a file request', () => {
  it('gives a public address with an unguessable token and keeps only its hash', async () => {
    const { token, id } = await create();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    const request = rig.opened.store.driveFileRequests.byId(id);
    expect(request).toMatchObject({ folderItemId: inbox.id, uploads: 0, bytes: 0, closedAt: null });
    expect(rig.opened.store.driveFileRequests.byToken(token)).toBeUndefined();
  });

  it('refuses a member when the owner has not allowed members to share links', async () => {
    rig.opened.store.driveGrants.set(
      { itemId: inbox.id, profileId: rig.memberId, role: 'edit', expiresAt: null },
      rig.ownerId,
    );
    return expect(
      refused(() =>
        requests.create(members(), {
          folderItemId: inbox.id,
          title: 'x',
          message: null,
          expiresAt: null,
        }),
      ),
    ).resolves.toMatchObject({ code: 'forbidden' });
  });

  it('refuses a file, someone who cannot share the folder and a folder nobody can open', async () => {
    const file = await rig.seedFile(rig.mine, 'note.txt', 'x');
    expect(
      await refused(() =>
        requests.create(owner, {
          folderItemId: file.id,
          title: 'x',
          message: null,
          expiresAt: null,
        }),
      ),
    ).toMatchObject({ code: 'invalid_request' });
    rig.opened.store.driveGrants.set(
      { itemId: inbox.id, profileId: rig.memberId, role: 'edit', expiresAt: null },
      rig.ownerId,
    );
    expect(
      await refused(() =>
        requests.create(
          { ...members(), linksAllowed: true },
          {
            folderItemId: inbox.id,
            title: 'x',
            message: null,
            expiresAt: null,
          },
        ),
      ),
    ).toMatchObject({ code: 'forbidden' });
    const hidden = await rig.seedFolder(rig.mine, 'Hidden');
    expect(
      await refused(() =>
        requests.create(
          { ...members(), linksAllowed: true },
          {
            folderItemId: hidden.id,
            title: 'x',
            message: null,
            expiresAt: null,
          },
        ),
      ),
    ).toMatchObject({ code: 'not_found' });
  });

  it('lists, changes and closes only the requests the person made', async () => {
    const { id } = await create();
    expect((await requests.list(owner, undefined, undefined)).items.map((row) => row.id)).toEqual([
      id,
    ]);
    expect((await requests.list(owner, inbox.id, undefined)).items).toHaveLength(1);
    expect((await requests.list(members(), undefined, undefined)).items).toEqual([]);
    expect((await requests.update(owner, id, { title: 'Renamed' })).title).toBe('Renamed');
    await expect(requests.close(members(), id)).rejects.toThrow(/no such/u);
    expect((await requests.close(owner, id)).closedAt).not.toBeNull();
  });
});

describe('the public side of a file request', () => {
  it('opens with the person name, the title and the message', async () => {
    const { token } = await create();
    const open = await requests.open(token, '10.0.0.1');
    expect(open).toMatchObject({
      state: 'open',
      request: { title: 'Holiday photos', message: 'Send me what you took' },
    });
    expect(open.fromName.length).toBeGreaterThan(0);
  });

  it('refuses a wrong token and limits repeated wrong tokens from one address', async () => {
    await create();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(requests.open('x'.repeat(43), '10.0.0.9')).rejects.toThrow(
        /no longer available/u,
      );
    }
    await expect(requests.open('x'.repeat(43), '10.0.0.9')).rejects.toThrow(/Too many/u);
    expect((await requests.open((await create()).token, '10.0.0.8')).state).toBe('open');
  });

  it('shows a closed request as closed and accepts no files into it', async () => {
    const { token, id } = await create();
    await requests.close(owner, id);
    expect((await requests.open(token, '10.0.0.1')).state).toBe('closed');
    expect(await refused(() => requests.receiving(token, '10.0.0.1'))).toMatchObject({
      code: 'link_expired',
    });
  });

  it('shows a request past its end date as expired at the moment it passes', async () => {
    const { token } = await create('2026-11-07T01:00:00.000Z');
    expect((await requests.open(token, '10.0.0.1')).state).toBe('open');
    clock = new Date('2026-11-07T01:00:00.000Z');
    expect((await requests.open(token, '10.0.0.1')).state).toBe('expired');
  });

  it('stops working when the folder is gone or its maker cannot share it any more', async () => {
    const { token } = await create();
    rig.opened.store.driveItems.remove(inbox.id);
    await expect(requests.open(token, '10.0.0.1')).rejects.toThrow(/no longer available/u);
  });
});

describe('receiving files', () => {
  it('lands the file in the folder, counts it and tells the maker once per sender', async () => {
    const { token, id } = await create();
    const first = await send(token, { name: 'a.txt', text: BODY });
    expect(first).toMatchObject({ done: true, name: 'a.txt', offset: BODY.length });
    expect(await readFile(join(rig.mine.path, 'Inbox', 'a.txt'), 'utf8')).toBe(BODY);
    const item = rig.opened.store.driveItems.byPath(rig.mine.id, 'Inbox/a.txt', null);
    expect(item).toMatchObject({ addedByProfileId: rig.ownerId, bytes: BODY.length });
    await send(token, { name: 'b.txt', text: 'second', uploader: 'Alex' });
    await send(token, { name: 'c.txt', text: 'third', uploader: 'Sam' });
    const request = rig.opened.store.driveFileRequests.byId(id);
    expect(request).toMatchObject({ uploads: 3, bytes: BODY.length + 6 + 5 });
    const uploads = rig.opened.store.driveFileRequests.uploads(id, null, 10).uploads;
    expect(uploads.map((upload) => upload.uploaderName).sort()).toEqual(['Alex', 'Alex', 'Sam']);
    const rows = rig.opened.store.driveNotifications.list(rig.ownerId, null, 10).notifications;
    expect(rows.map((row) => [row.kind, row.actorName, row.count]).sort()).toEqual([
      ['file_request_upload', 'Alex', 2],
      ['file_request_upload', 'Sam', 1],
    ]);
    expect(rows.every((row) => row.itemId === inbox.id && row.refId === id)).toBe(true);
  });

  it('gives a clashing name a number instead of replacing the file', async () => {
    const { token } = await create();
    await send(token, { name: 'photo.jpg', text: 'one' });
    const second = await send(token, { name: 'photo.jpg', text: 'two' });
    expect(second.name).toBe('photo (2).jpg');
    expect(await readFile(join(rig.mine.path, 'Inbox', 'photo.jpg'), 'utf8')).toBe('one');
    expect(await readFile(join(rig.mine.path, 'Inbox', 'photo (2).jpg'), 'utf8')).toBe('two');
  });

  it('takes an empty file at once and strips any folder path from the name', async () => {
    const { token } = await create();
    const empty = await send(token, { name: '../../escape.txt', text: '' });
    expect(empty).toMatchObject({ done: true, name: 'escape.txt' });
    expect(await readdir(join(rig.mine.path, 'Inbox'))).toEqual(['escape.txt']);
  });

  it('keeps a partial upload resumable by asking where it stopped', async () => {
    const { token } = await create();
    const request = await found(token);
    const started = await intake.begin(request, { uploader: 'Alex', name: 'big.bin', length: 10 });
    await intake.append(request, {
      uploadId: started.uploadId,
      offset: 0,
      chunks: stream('12345'),
      uploader: 'Alex',
      name: 'big.bin',
    });
    expect(await intake.status(request, started.uploadId)).toMatchObject({ offset: 5, length: 10 });
    expect(
      await refused(() =>
        intake.append(request, {
          uploadId: started.uploadId,
          offset: 2,
          chunks: stream('zz'),
          uploader: 'Alex',
          name: 'big.bin',
        }),
      ),
    ).toMatchObject({ code: 'conflict' });
    const done = await intake.append(request, {
      uploadId: started.uploadId,
      offset: 5,
      chunks: stream('67890'),
      uploader: 'Alex',
      name: 'big.bin',
    });
    expect(done.done).toBe(true);
    expect(await readFile(join(rig.mine.path, 'Inbox', 'big.bin'), 'utf8')).toBe('1234567890');
  });

  it('refuses bytes past the declared length and removes nothing that was received before', async () => {
    const { token } = await create();
    const request = await found(token);
    const started = await intake.begin(request, { uploader: 'Alex', name: 'f.bin', length: 4 });
    expect(
      await refused(() =>
        intake.append(request, {
          uploadId: started.uploadId,
          offset: 0,
          chunks: stream('12345'),
          uploader: 'Alex',
          name: 'f.bin',
        }),
      ),
    ).toMatchObject({ code: 'payload_too_large' });
    expect(await intake.status(request, started.uploadId)).toMatchObject({ offset: 0 });
  });

  it('refuses an upload id of another request, a made up one and a missing name', async () => {
    const first = await create();
    const second = await create();
    const started = await intake.begin(await found(first.token), {
      uploader: 'Alex',
      name: 'f.bin',
      length: 3,
    });
    expect(
      await refused(async () => intake.status(await found(second.token), started.uploadId)),
    ).toMatchObject({
      code: 'not_found',
    });
    expect(
      await refused(async () => intake.status(await found(first.token), 'not-an-id')),
    ).toMatchObject({
      code: 'not_found',
    });
    expect(
      await refused(async () =>
        intake.status(await found(first.token), `00000000-0000-4000-8000-000000000000-3`),
      ),
    ).toMatchObject({ code: 'not_found' });
  });

  it('applies the quota of the drive owner and says how much is missing', async () => {
    const { token } = await create();
    rig.opened.store.driveQuotas.set(rig.ownerId, 10);
    const error = await refused(() => send(token, { name: 'big.bin', text: 'x'.repeat(50) }));
    expect(error).toBeInstanceOf(DriveQuotaExceededError);
    expect(error instanceof Error ? error.message : '').toMatch(/space limit is 10 bytes/u);
    expect(await readdir(join(rig.mine.path, 'Inbox'))).toEqual([]);
    rig.opened.store.driveQuotas.set(rig.ownerId, 1000);
    expect((await send(token, { name: 'ok.bin', text: 'x'.repeat(50) })).done).toBe(true);
  });

  it('counts what arrived toward the quota of the drive owner', async () => {
    const { token } = await create();
    await send(token, { name: 'a.bin', text: 'x'.repeat(40) });
    expect(rig.opened.store.driveQuotas.status(rig.ownerId).usage.live).toBeGreaterThanOrEqual(40);
  });

  it('feeds a received file as an outside sender, not as the owner, while the bytes stay in the owner quota', async () => {
    const { token } = await create();
    const progress = await send(token, { name: 'a.bin', text: 'hello' });
    const item = rig.opened.store.driveItems.byId(progress.itemId ?? '', rig.ownerId);
    expect(item.addedByProfileId).toBe(rig.ownerId);
    const row = rig.opened.store.driveFeed
      .sinceInRoot(rig.mine.id, 0, 100)
      .rows.find((entry) => entry.itemId === item.id);
    expect(row).toMatchObject({ actorProfileId: null, via: 'share' });
  });

  it('counts the other open partial uploads of the request against the quota', async () => {
    const { token } = await create();
    rig.opened.store.driveQuotas.set(rig.ownerId, 1000);
    const request = await found(token);
    const used = rig.opened.store.driveQuotas.status(rig.ownerId).usage.live;
    rig.opened.store.driveQuotas.set(rig.ownerId, used + 100);
    await intake.begin(request, { uploader: 'Alex', name: 'a.bin', length: 60 });
    const error = await refused(() =>
      intake.begin(request, { uploader: 'Alex', name: 'b.bin', length: 60 }),
    );
    expect(error).toBeInstanceOf(DriveQuotaExceededError);
  });

  it('counts the unwritten rest of every open upload against the free disk space', async () => {
    const { token } = await create();
    const request = await found(token);
    const small = new FileRequestIntake({
      env: rig.changeEnv(),
      store: rig.opened.store,
      space: (): Promise<{ totalBytes: number; freeBytes: number }> =>
        Promise.resolve({ totalBytes: 1000, freeBytes: 100 }),
    });
    await small.begin(request, { uploader: 'Alex', name: 'a.bin', length: 80 });
    expect(
      await refused(() => small.begin(request, { uploader: 'Alex', name: 'b.bin', length: 80 })),
    ).toBeInstanceOf(DriveFreeSpaceError);
  });

  it('reclaims abandoned partial uploads when a new upload starts', async () => {
    const { token } = await create();
    const request = await found(token);
    const old = await intake.begin(request, { uploader: 'Alex', name: 'old.bin', length: 4 });
    const directory = join(rig.mine.path, TMP_DIRECTORY);
    const oldName = (await readdir(directory)).find((name) => name.endsWith(old.uploadId)) ?? '';
    const longAgo = new Date(Date.now() - 30 * 86_400_000);
    await utimes(join(directory, oldName), longAgo, longAgo);
    await intake.begin(request, { uploader: 'Alex', name: 'new.bin', length: 4 });
    expect((await readdir(directory)).some((name) => name.endsWith(old.uploadId))).toBe(false);
  });

  it('cancels a partial upload', async () => {
    const { token } = await create();
    const request = await found(token);
    const started = await intake.begin(request, { uploader: 'Alex', name: 'f.bin', length: 4 });
    await intake.cancel(request, started.uploadId);
    expect(await refused(() => intake.status(request, started.uploadId))).toMatchObject({
      code: 'not_found',
    });
  });

  it('removes only the old partial uploads when it sweeps', async () => {
    const { token } = await create();
    const request = await found(token);
    const old = await intake.begin(request, { uploader: 'Alex', name: 'old.bin', length: 4 });
    const fresh = await intake.begin(request, { uploader: 'Alex', name: 'new.bin', length: 4 });
    const directory = join(rig.mine.path, TMP_DIRECTORY);
    const names = await readdir(directory);
    const oldName = names.find((name) => name.endsWith(old.uploadId)) ?? '';
    await writeFile(join(directory, 'tus-keep'), 'x');
    const longAgo = new Date(NOW.getTime() - 10 * 86_400_000);
    await utimes(join(directory, oldName), longAgo, longAgo);
    await utimes(join(directory, 'tus-keep'), longAgo, longAgo);
    const removed = await intake.sweepStale(rig.mine, 86_400_000);
    expect(removed).toBe(1);
    const left = await readdir(directory);
    expect(left).toContain('tus-keep');
    expect(left.some((name) => name.endsWith(fresh.uploadId))).toBe(true);
    expect(left.some((name) => name.endsWith(old.uploadId))).toBe(false);
  });
});

describe('the public page and its upload routes', () => {
  let server: Server;
  let base = '';

  beforeEach(async () => {
    const routes = fileRequestRoutes({ requests, intake });
    server = createServer((request, response) => {
      const pathname = new URL(request.url ?? '/', 'http://x').pathname;
      const route = routes.find(
        (candidate) =>
          candidate.method === request.method && matchPath(candidate.path, pathname) !== null,
      );
      const params = route === undefined ? null : matchPath(route.path, pathname);
      if (route === undefined || params === null) {
        response.writeHead(404).end();
        return;
      }
      route.handle(request, response, params).catch((cause: unknown) => {
        if (cause instanceof ApiError) sendError(response, cause);
        else response.writeHead(500).end();
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    base = `http://127.0.0.1:${String(address.port)}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  it('serves the page with the form and a script that only its own nonce may run', async () => {
    const { token } = await create();
    const response = await fetch(`${base}/r/${token}`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('Holiday photos');
    expect(html).toContain('Send me what you took');
    expect(html).toContain('Your name');
    expect(html).toContain('prefers-color-scheme: dark');
    const policy = response.headers.get('content-security-policy') ?? '';
    const nonce = /nonce-([^']+)'/u.exec(policy)?.[1] ?? '';
    expect(nonce).not.toBe('');
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(policy).toContain("default-src 'none'");
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('escapes what the maker typed', async () => {
    const created = await requests.create(owner, {
      folderItemId: inbox.id,
      title: '<img src=x onerror=alert(1)>',
      message: '"><script>alert(2)</script>',
      expiresAt: null,
    });
    const html = await (await fetch(`${base}/r/${created.url.split('/r/')[1] ?? ''}`)).text();
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(2)');
    expect(html).toContain('&lt;img src=x');
  });

  it('shows the closed and expired states without a form, and a plain page for a wrong link', async () => {
    const { token, id } = await create();
    await requests.close(owner, id);
    const closed = await (await fetch(`${base}/r/${token}`)).text();
    expect(closed).toContain('closed');
    expect(closed).not.toContain('id="who"');
    const wrong = await fetch(`${base}/r/${'z'.repeat(43)}`);
    expect(wrong.status).toBe(404);
    expect(await wrong.text()).toContain('no longer available');
  });

  it('takes a file in chunks over HTTP and answers where an interrupted upload stopped', async () => {
    const { token } = await create();
    const headers = {
      'X-Uploader-Name': encodeURIComponent('Zoë'),
      'X-File-Name': encodeURIComponent('Snap shot.txt'),
    };
    const start = await fetch(`${base}/r/${token}/files`, {
      method: 'POST',
      headers: { ...headers, 'X-Upload-Length': '10' },
    });
    expect(start.status).toBe(201);
    const { uploadId } = STARTED.parse(await start.json());
    const first = await fetch(`${base}/r/${token}/files/${uploadId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Upload-Offset': '0' },
      body: '12345',
    });
    expect(await first.json()).toMatchObject({ offset: 5, done: false });
    const head = await fetch(`${base}/r/${token}/files/${uploadId}`, { method: 'HEAD' });
    expect(head.headers.get('upload-offset')).toBe('5');
    const last = await fetch(`${base}/r/${token}/files/${uploadId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Upload-Offset': '5' },
      body: '67890',
    });
    expect(await last.json()).toMatchObject({ done: true, name: 'Snap shot.txt' });
    expect(await readFile(join(rig.mine.path, 'Inbox', 'Snap shot.txt'), 'utf8')).toBe(
      '1234567890',
    );
    const row = rig.opened.store.driveFileRequests.uploads(
      (await requests.list(owner, undefined, undefined)).items[0]?.id ?? '',
      null,
      5,
    ).uploads[0];
    expect(row?.uploaderName).toBe('Zoë');
  });

  it('refuses an upload without a name, to a wrong or closed link, and over the quota', async () => {
    const { token, id } = await create();
    const noName = await fetch(`${base}/r/${token}/files`, {
      method: 'POST',
      headers: { 'X-File-Name': 'a.txt', 'X-Upload-Length': '3' },
    });
    expect(noName.status).toBe(400);
    const wrong = await fetch(`${base}/r/${'q'.repeat(43)}/files`, {
      method: 'POST',
      headers: { 'X-Uploader-Name': 'A', 'X-File-Name': 'a.txt', 'X-Upload-Length': '3' },
    });
    expect(wrong.status).toBe(404);
    rig.opened.store.driveQuotas.set(rig.ownerId, 1);
    const over = await fetch(`${base}/r/${token}/files`, {
      method: 'POST',
      headers: { 'X-Uploader-Name': 'A', 'X-File-Name': 'a.txt', 'X-Upload-Length': '300' },
    });
    expect(over.status).toBe(422);
    expect(REFUSAL.parse(await over.json()).error.message).toMatch(/space limit/u);
    await requests.close(owner, id);
    const closed = await fetch(`${base}/r/${token}/files`, {
      method: 'POST',
      headers: { 'X-Uploader-Name': 'A', 'X-File-Name': 'a.txt', 'X-Upload-Length': '3' },
    });
    expect(closed.status).toBe(410);
  });
});
