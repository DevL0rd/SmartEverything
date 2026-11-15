import { createServer, type Server } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError, MEDIA_PATHS, type DriveDownload } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveDownloads } from '../../src/drive/download-zip';
import { DriveReadService } from '../../src/drive/service-read';
import { listZip } from '../../src/drive/content/zip-index';
import { driveDownloadRawRoute } from '../../src/server/handlers/drive-download';
import { MediaLinks } from '../../src/server/media-links';
import { openFsRig, NOW, type FsRig } from './fs-rig';

let rig: FsRig;
let clock = NOW.getTime();
let links: MediaLinks;
let downloads: DriveDownloads;
let server: Server | null = null;
let base = '';
let counter = 0;

function build(): DriveDownloads {
  const { store } = rig.opened;
  return new DriveDownloads({
    store,
    read: new DriveReadService(store),
    links,
    now: () => new Date(clock),
    newId: () => `ticket-${String((counter += 1))}`,
  });
}

function ticketOf(download: DriveDownload): string {
  return new URL(download.url, 'http://hub').pathname.split('/').at(-1) ?? '';
}

async function serve(ticketId: string): Promise<void> {
  const route = driveDownloadRawRoute(links, downloads);
  const opened = createServer((request, response) => {
    route.handle(request, response, { ticketId }).catch((cause: unknown) => {
      response.writeHead(cause instanceof ApiError ? cause.status : 500).end();
    });
  });
  await new Promise<void>((resolve) => opened.listen(0, '127.0.0.1', resolve));
  server = opened;
  const address = opened.address();
  base =
    typeof address === 'object' && address !== null
      ? `http://127.0.0.1:${String(address.port)}`
      : '';
}

async function namesOf(download: DriveDownload): Promise<readonly string[]> {
  await serve(ticketOf(download));
  const response = await fetch(`${base}${download.url}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/zip');
  const folder = join(rig.opened.layout.root, 'downloaded');
  await mkdir(folder, { recursive: true });
  const file = join(folder, `${String((counter += 1))}.zip`);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
  const listing = await listZip(file, 0, 1000);
  return listing.items.map((entry) => entry.path);
}

async function refusal(work: () => Promise<unknown>): Promise<ApiError> {
  try {
    await work();
  } catch (cause) {
    if (cause instanceof ApiError) return cause;
    throw cause;
  }
  throw new Error('it was not refused');
}

beforeEach(async () => {
  clock = NOW.getTime();
  rig = await openFsRig();
  links = new MediaLinks(() => new Date(clock));
  downloads = build();
});

afterEach(async () => {
  if (server !== null) {
    const closing = server;
    await new Promise<void>((resolve) => {
      closing.close(() => {
        resolve();
      });
    });
    server = null;
  }
  await rig.opened.close();
});

describe('Drive zip download', () => {
  it('streams a folder tree as one zip with its folders and files', async () => {
    const docs = await rig.seedFolder(rig.mine, 'Docs');
    await rig.seedFolder(rig.mine, 'Docs/sub');
    await rig.seedFile(rig.mine, 'Docs/a.txt', 'alpha');
    await rig.seedFile(rig.mine, 'Docs/sub/b.txt', 'bravo');
    const prepared = await downloads.prepare({ profileId: rig.ownerId }, [docs.id]);
    expect(prepared).toMatchObject({
      kind: 'zip',
      name: 'Docs.zip',
      files: 2,
      folders: 2,
      bytes: 10,
      skipped: [],
    });
    expect([...(await namesOf(prepared))].sort()).toEqual([
      'Docs',
      'Docs/a.txt',
      'Docs/sub',
      'Docs/sub/b.txt',
    ]);
  });

  it('answers one file with its signed download link', async () => {
    const file = await rig.seedFile(rig.mine, 'one.txt', 'single');
    const prepared = await downloads.prepare({ profileId: rig.ownerId }, [file.id]);
    expect(prepared).toMatchObject({ kind: 'file', name: 'one.txt', size: 6, files: 1 });
    const url = new URL(prepared.url, 'http://hub');
    expect(url.pathname).toBe(`/media/drive/${file.id}/file`);
    expect(url.searchParams.get('download')).toBe('1');
  });

  it('lists a locked folder a view grantee may not take out in skipped and zips the rest', async () => {
    const locked = await rig.seedFolder(rig.mine, 'Locked');
    await rig.seedFile(rig.mine, 'Locked/secret.txt', 'secret');
    const open = await rig.seedFolder(rig.mine, 'Open');
    await rig.seedFile(rig.mine, 'Open/fine.txt', 'fine');
    const { store } = rig.opened;
    for (const item of [locked, open]) {
      store.driveGrants.set(
        { itemId: item.id, profileId: rig.memberId, role: 'view', expiresAt: null },
        rig.ownerId,
      );
    }
    store.driveLocks.set(locked.id, rig.ownerId, true);
    const prepared = await downloads.prepare({ profileId: rig.memberId }, [locked.id, open.id]);
    expect(prepared.skipped.map((entry) => entry.path)).toEqual(['Locked']);
    expect(prepared.skipped[0]?.reason).toContain('view only');
    const names = await namesOf(prepared);
    expect(names).toContain('Open/fine.txt');
    expect(names.some((name) => name.includes('secret'))).toBe(false);
  });

  it('refuses a download that nothing could be taken from', async () => {
    const locked = await rig.seedFolder(rig.mine, 'Locked');
    await rig.seedFile(rig.mine, 'Locked/secret.txt', 'secret');
    const { store } = rig.opened;
    store.driveGrants.set(
      { itemId: locked.id, profileId: rig.memberId, role: 'view', expiresAt: null },
      rig.ownerId,
    );
    store.driveLocks.set(locked.id, rig.ownerId, true);
    const refused = await refusal(() =>
      downloads.prepare({ profileId: rig.memberId }, [locked.id]),
    );
    expect(refused.code).toBe('forbidden');
  });

  it('never includes another person’s items, the owner included', async () => {
    const mine = await rig.seedFile(rig.mine, 'mine.txt', 'mine');
    const theirs = await rig.seedFile(rig.theirs, 'theirs.txt', 'theirs');
    const prepared = await downloads.prepare({ profileId: rig.ownerId }, [mine.id, theirs.id]);
    expect(prepared.kind).toBe('file');
    const both = await rig.seedFile(rig.mine, 'second.txt', 'second');
    const zipped = await downloads.prepare({ profileId: rig.ownerId }, [
      both.id,
      theirs.id,
      mine.id,
    ]);
    expect(zipped.skipped).toEqual([{ path: theirs.id, reason: 'It is not available to you.' }]);
    const names = await namesOf(zipped);
    expect(names).toContain('mine.txt');
    expect(names.some((name) => name.includes('theirs'))).toBe(false);
    const alone = await refusal(() => downloads.prepare({ profileId: rig.ownerId }, [theirs.id]));
    expect(alone.code).toBe('forbidden');
  });

  it('refuses a ticket after it expires and after it was fetched once', async () => {
    const docs = await rig.seedFolder(rig.mine, 'Docs');
    await rig.seedFile(rig.mine, 'Docs/a.txt', 'alpha');
    const first = await downloads.prepare({ profileId: rig.ownerId }, [docs.id]);
    clock += 11 * 60_000;
    expect((await refusal(() => Promise.resolve(downloads.take(ticketOf(first))))).code).toBe(
      'not_found',
    );
    const second = await downloads.prepare({ profileId: rig.ownerId }, [docs.id]);
    expect(downloads.take(ticketOf(second)).name).toBe('Docs.zip');
    expect((await refusal(() => Promise.resolve(downloads.take(ticketOf(second))))).code).toBe(
      'not_found',
    );
  });

  it('serves the ticket path the domain names and refuses an unsigned fetch', async () => {
    const docs = await rig.seedFolder(rig.mine, 'Docs');
    await rig.seedFile(rig.mine, 'Docs/a.txt', 'alpha');
    const prepared = await downloads.prepare({ profileId: rig.ownerId }, [docs.id]);
    expect(MEDIA_PATHS.driveDownload).toBe('/media/drive-downloads/:ticketId');
    expect(new URL(prepared.url, 'http://hub').pathname).toBe(
      `/media/drive-downloads/${ticketOf(prepared)}`,
    );
    await serve(ticketOf(prepared));
    const unsigned = await fetch(`${base}/media/drive-downloads/${ticketOf(prepared)}`);
    expect(unsigned.status).toBe(401);
  });
});
