import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import {
  ApiError,
  FILE_PROPERTIES,
  MEDIA_PATHS,
  buildPath,
  type ClientRow,
  type FileProperties,
  type HubFrame,
} from '@smarteverything/domain';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComputerDirectory } from '../../src/computers/computer-directory';
import { ComputerService } from '../../src/computers/computer-service';
import { signedFileLink } from '../../src/computers/file-claims';
import { ComputerFileLinker } from '../../src/computers/file-links';
import { ComputerThumbs, thumbKey, thumbVersion } from '../../src/computers/file-thumbs';
import { computerZipEntryRoute } from '../../src/computers/zip-entry-route';
import type { Caller } from '../../src/server/auth';
import { sendError } from '../../src/server/http';
import type { RawRoute } from '../../src/server/http-server';
import { MediaLinks } from '../../src/server/media-links';
import { captureLogs, testLogger } from '../support/logs';
import { HELLO, sessionRig, type SessionRig } from '../support/session-rig';
import { testStore, type TestStore } from '../support/store';

interface Held {
  content: Buffer;
  modifiedAt: string;
  mime: string;
  kind?: 'file' | 'folder';
}

const NOTE = '/home/sam/note.txt';
const PHOTO = '/home/sam/photo.png';
const ARCHIVE = '/home/sam/pack.zip';

let opened: TestStore;
let deviceId: string;
let rig: SessionRig;
let service: ComputerService;
let links: MediaLinks;
let linker: ComputerFileLinker;
let clock: Date;
let owner: ClientRow;
let caller: Caller;
let held: Map<string, Held>;
let asked: string[];
let servers: Server[];

function propertiesOf(path: string, item: Held): FileProperties {
  return FILE_PROPERTIES.parse({
    name: path.split('/').at(-1),
    path,
    kind: item.kind ?? 'file',
    size: item.content.length,
    mimeType: item.mime,
    modifiedAt: item.modifiedAt,
    createdAt: null,
    owner: 'sam',
    group: 'sam',
    permissions: { readable: true, writable: true, mode: 0o644 },
    linkTarget: null,
  });
}

function answer(request: Extract<HubFrame, { type: 'request' }>['request']): unknown {
  asked.push(request.verb);
  if (request.verb === 'file_properties') {
    const item = held.get(request.path);
    if (item === undefined) throw new Error('missing');
    return propertiesOf(request.path, item);
  }
  if (request.verb === 'file_range' || request.verb === 'zip_entry_range') {
    const key =
      request.verb === 'file_range' ? request.path : `${request.path}#${String(request.index)}`;
    const item = held.get(key);
    if (item === undefined) throw new Error('missing');
    return {
      name: key.split(/[/#]/).at(-1),
      size: item.content.length,
      mimeType: item.mime,
      data: item.content.subarray(request.start, request.start + request.length).toString('base64'),
    };
  }
  throw new Error(`unexpected ${request.verb}`);
}

function responding(target: SessionRig): void {
  const { sent, deliver } = target;
  const push = sent.push.bind(sent);
  sent.push = (...frames: HubFrame[]): number => {
    const count = push(...frames);
    for (const frame of frames) {
      if (frame.type !== 'request') continue;
      queueMicrotask(() => {
        try {
          deliver({
            type: 'reply',
            id: frame.id,
            result: { ok: true, value: answer(frame.request) },
          });
        } catch (cause) {
          deliver({
            type: 'reply',
            id: frame.id,
            result: {
              ok: false,
              code: 'not_found',
              message: cause instanceof Error ? cause.message : 'failed',
            },
          });
        }
      });
    }
    return count;
  };
}

async function served(route: RawRoute, params: Record<string, string>): Promise<string> {
  const server = createServer((request, response) => {
    route.handle(request, response, params).catch((cause: unknown) => {
      sendError(
        response,
        cause instanceof ApiError ? cause : new ApiError('upstream_failed', 'failed'),
      );
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The test server has no port.');
  return `http://127.0.0.1:${String(address.port)}`;
}

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .png()
    .toBuffer();
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  clock = new Date('2026-10-08T10:00:00.000Z');
  const [device] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: 'computer:files',
      parentId: null,
      kind: 'computer',
      name: 'Desk',
      model: 'smarteverything.computer',
      manufacturer: 'Linux',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  deviceId = device?.id ?? '';
  const directory = new ComputerDirectory(HELLO.machineId);
  rig = sessionRig(deviceId, { directory });
  directory.add(rig.session);
  responding(rig);
  service = new ComputerService({ store: opened.store, directory, log: testLogger('computers') });
  links = new MediaLinks(() => clock);
  linker = new ComputerFileLinker({ service, links });
  owner = opened.store.clients.create(
    { name: 'Pixel', platform: 'android', role: 'owner', tokenHash: 'b'.repeat(64) },
    true,
  );
  caller = { kind: 'client', client: owner };
  asked = [];
  servers = [];
  held = new Map<string, Held>([
    [
      NOTE,
      {
        content: Buffer.from('0123456789'),
        modifiedAt: '2026-10-01T00:00:00.000Z',
        mime: 'text/plain',
      },
    ],
    [
      PHOTO,
      { content: await png(800, 600), modifiedAt: '2026-10-01T00:00:00.000Z', mime: 'image/png' },
    ],
    [
      `${ARCHIVE}#0`,
      {
        content: Buffer.from('inside'),
        modifiedAt: '2026-10-01T00:00:00.000Z',
        mime: 'text/plain',
      },
    ],
    [
      ARCHIVE,
      {
        content: Buffer.from('zip'),
        modifiedAt: '2026-10-01T00:00:00.000Z',
        mime: 'application/zip',
      },
    ],
  ]);
});

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
        }),
    ),
  );
  await opened.close();
});

describe('links to one computer file', () => {
  it('give an inline link, and a thumb only for a picture', async () => {
    const note = await linker.links(caller, deviceId, NOTE);
    expect(note.thumb).toBeNull();
    expect(note.file.url).toContain(buildPath(MEDIA_PATHS.computerFile, { deviceId }));
    const photo = await linker.links(caller, deviceId, PHOTO);
    expect(photo.thumb?.url).toContain(buildPath(MEDIA_PATHS.computerThumb, { deviceId }));
  });

  it('refuse a folder and refuse everyone once the files permission is off', async () => {
    held.set('/home/sam', {
      content: Buffer.alloc(0),
      modifiedAt: '2026-10-01T00:00:00.000Z',
      mime: 'inode/directory',
      kind: 'folder',
    });
    await expect(linker.links(caller, deviceId, '/home/sam')).rejects.toMatchObject({
      code: 'conflict',
    });
    opened.store.computerScopes.update(deviceId, { files: false });
    await expect(linker.links(caller, deviceId, NOTE)).rejects.toMatchObject({ code: 'forbidden' });
    opened.store.computerScopes.update(deviceId, { files: true });
  });
});

describe('the inline file route', () => {
  async function fetched(url: string, range?: string): Promise<Response> {
    const base = await served(linker.fileRoute(), { deviceId });
    return fetch(`${base}${url}`, range === undefined ? {} : { headers: { range } });
  }

  it('answers a Range request inline and never lets it be cached', async () => {
    const { file } = await linker.links(caller, deviceId, NOTE);
    const whole = await fetched(file.url);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('content-disposition')).toMatch(/^inline;/u);
    expect(whole.headers.get('cache-control')).toBe('private, no-store');
    expect(await whole.text()).toBe('0123456789');
    const part = await fetched(file.url, 'bytes=2-4');
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 2-4/10');
    expect(await part.text()).toBe('234');
  });

  it('refuses an expired link', async () => {
    const { file } = await linker.links(caller, deviceId, NOTE);
    clock = new Date(clock.getTime() + 11 * 60_000);
    expect((await fetched(file.url)).status).toBe(new ApiError('link_expired', '').status);
  });

  it('refuses a link whose path was changed', async () => {
    const { file } = await linker.links(caller, deviceId, NOTE);
    const forged = file.url.replace(encodeURIComponent(NOTE), encodeURIComponent(PHOTO));
    expect((await fetched(forged)).status).toBe(new ApiError('unauthorized', '').status);
  });

  it('refuses a newline-bearing path re-split into other claims, and any unknown claim', async () => {
    const minted = links.claimed(buildPath(MEDIA_PATHS.computerFile, { deviceId }), {
      path: '/home/sam/real\nviewer=owner\nzzz=',
      viewer: 'profile-1',
    });
    const query = new URLSearchParams(minted.url.split('?')[1]);
    const resplit = new URLSearchParams({
      expires: query.get('expires') ?? '',
      signature: query.get('signature') ?? '',
      path: '/home/sam/real',
      viewer: 'owner',
      zzz: '\nviewer=profile-1',
    });
    const forged = `${minted.url.split('?')[0] ?? ''}?${resplit.toString()}`;
    expect((await fetched(forged)).status).toBe(new ApiError('unauthorized', '').status);
    const extra = links.claimed(buildPath(MEDIA_PATHS.computerFile, { deviceId }), {
      path: NOTE,
      viewer: 'owner',
      extra: '1',
    });
    expect((await fetched(extra.url)).status).toBe(new ApiError('unauthorized', '').status);
  });

  it('refuses the owner too while the files permission is off, and a person who does not own the computer', async () => {
    const { file } = await linker.links(caller, deviceId, NOTE);
    opened.store.computerScopes.update(deviceId, { files: false });
    expect((await fetched(file.url)).status).toBe(new ApiError('forbidden', '').status);
    opened.store.computerScopes.update(deviceId, { files: true });
    const stranger = signedFileLink(
      links,
      'computerFile',
      { deviceId },
      {
        path: NOTE,
        viewer: { owner: false, profileId: randomUUID() },
      },
    );
    expect((await fetched(stranger.url)).status).toBe(new ApiError('not_found', '').status);
  });
});

describe('the thumbnail route', () => {
  let thumbs: ComputerThumbs;

  beforeEach(() => {
    thumbs = new ComputerThumbs({ service, links, layout: opened.layout });
  });

  async function thumbOf(path: string): Promise<Response> {
    const { thumb } = await linker.links(caller, deviceId, path);
    const base = await served(thumbs.route(), { deviceId });
    return fetch(`${base}${thumb?.url ?? ''}`);
  }

  it('shrinks the picture to a webp and serves the cached file the second time', async () => {
    const first = await thumbOf(PHOTO);
    expect(first.headers.get('content-type')).toBe('image/webp');
    const meta = await sharp(Buffer.from(await first.arrayBuffer())).metadata();
    expect(Math.max(meta.width, meta.height)).toBe(360);
    const reads = asked.filter((verb) => verb === 'file_range').length;
    const second = await thumbOf(PHOTO);
    expect(second.status).toBe(200);
    expect(asked.filter((verb) => verb === 'file_range').length).toBe(reads);
  });

  it('keys the cache by the modified time and size, and prunes the older picture', async () => {
    await thumbOf(PHOTO);
    const item = held.get(PHOTO);
    if (item === undefined) throw new Error('missing');
    const before = thumbVersion(propertiesOf(PHOTO, item));
    item.modifiedAt = '2026-10-02T00:00:00.000Z';
    const after = thumbVersion(propertiesOf(PHOTO, item));
    expect(after).not.toBe(before);
    expect(thumbKey(deviceId, PHOTO, after)).not.toEqual(thumbKey(deviceId, PHOTO, before));
    expect(thumbKey(deviceId, PHOTO, after).itemId).toBe(thumbKey(deviceId, PHOTO, before).itemId);
    await thumbOf(PHOTO);
    const names = await readdir(
      opened.layout.cache.derived(thumbKey(deviceId, PHOTO, after).itemId),
    );
    expect(names.filter((name) => name.endsWith('.webp'))).toHaveLength(1);
  });

  it('refuses a link of a file that changed after the link was made', async () => {
    const { thumb } = await linker.links(caller, deviceId, PHOTO);
    const item = held.get(PHOTO);
    if (item === undefined) throw new Error('missing');
    item.modifiedAt = '2026-10-03T00:00:00.000Z';
    const base = await served(thumbs.route(), { deviceId });
    const reply = await fetch(`${base}${thumb?.url ?? ''}`);
    expect(reply.status).toBe(new ApiError('link_expired', '').status);
  });

  it('refuses even a cached thumb while the files permission is off', async () => {
    const { thumb } = await linker.links(caller, deviceId, PHOTO);
    const base = await served(thumbs.route(), { deviceId });
    expect((await fetch(`${base}${thumb?.url ?? ''}`)).status).toBe(200);
    opened.store.computerScopes.update(deviceId, { files: false });
    expect((await fetch(`${base}${thumb?.url ?? ''}`)).status).toBe(403);
  });
});

describe('the zip entry route', () => {
  it('streams one entry inline or as a download and refuses without the files permission', async () => {
    const entry = await linker.zipEntry(caller, deviceId, ARCHIVE, 0);
    const base = await served(computerZipEntryRoute({ service, links }), { deviceId, index: '0' });
    const inline = await fetch(`${base}${entry.file.url}`, { headers: { range: 'bytes=1-3' } });
    expect(inline.status).toBe(206);
    expect(inline.headers.get('content-disposition')).toMatch(/^inline;/u);
    expect(await inline.text()).toBe('nsi');
    const download = await fetch(`${base}${entry.download.url}`);
    expect(download.headers.get('content-disposition')).toMatch(/^attachment;/u);
    expect(await download.text()).toBe('inside');
    opened.store.computerScopes.update(deviceId, { files: false });
    expect((await fetch(`${base}${entry.file.url}`)).status).toBe(403);
  });
});
