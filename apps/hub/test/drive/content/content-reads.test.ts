import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApiError, type MediaLink } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  archiveEntryLink,
  itemText,
  listArchive,
  type DriveContentDeps,
} from '../../../src/drive/content/content-reads';
import type { DriveItemDraft } from '../../../src/store/repositories/drive-items';
import { personalDriveRoot } from '../../store/drive-roots-fixture';
import { testStore, type TestStore } from '../../support/store';
import { zipOf } from './builders';

const NOW = '2026-11-14T00:00:00.000Z';

let opened: TestStore;
let deps: DriveContentDeps;
let robin: { readonly profileId: string };
let sam: { readonly profileId: string };
let rootId: string;
let archiveId: string;
let textId: string;
let folderId: string;

function link(kind: string, itemId: string, index: number, rev: number): MediaLink {
  return {
    url: `/media/drive/${itemId}/zip/${String(index)}?kind=${kind}&rev=${String(rev)}`,
    expiresAt: NOW,
  };
}

function draft(
  id: string,
  name: string,
  mime: string,
  fields: { parentId?: string | null; relPath?: string } = {},
): DriveItemDraft {
  return {
    id,
    rootId,
    parentId: fields.parentId ?? null,
    relPath: fields.relPath ?? name,
    name,
    modifiedAt: NOW,
    addedAt: NOW,
    starred: false,
    shared: false,
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    kind: 'document',
    mime,
    bytes: 10,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
  };
}

beforeEach(async () => {
  opened = await testStore();
  const { store } = opened;
  const profiles = [
    store.profiles.create({ name: 'Robin' }),
    store.profiles.create({ name: 'Sam' }),
  ];
  robin = { profileId: profiles[0]?.id ?? '' };
  sam = { profileId: profiles[1]?.id ?? '' };
  rootId = randomUUID();
  const drive = opened.layout.person(robin.profileId).drive;
  await mkdir(join(drive, 'docs'), { recursive: true });
  await writeFile(
    join(drive, 'pack.zip'),
    zipOf([
      { name: 'one.txt', data: 'first' },
      { name: 'two.png', data: 'second', method: 'deflated' },
      { name: 'locked.bin', data: 'x', encrypted: true },
    ]),
  );
  await writeFile(join(drive, 'notes.txt'), 'plain notes');
  store.driveRoots.insert(personalDriveRoot(rootId, robin.profileId));
  archiveId = randomUUID();
  textId = randomUUID();
  folderId = randomUUID();
  store.driveItems.write({
    item: draft(archiveId, 'pack.zip', 'application/zip'),
    identity: { dev: '1', ino: archiveId },
  });
  store.driveItems.write({
    item: draft(textId, 'notes.txt', 'text/plain'),
    identity: { dev: '1', ino: textId },
  });
  store.driveItems.write({
    item: {
      id: folderId,
      rootId,
      parentId: null,
      relPath: 'docs',
      name: 'docs',
      modifiedAt: NOW,
      addedAt: NOW,
      starred: false,
      shared: false,
      outside: false,
      addedByProfileId: null,
      remoteId: null,
      remoteRev: null,
      kind: 'folder',
      childCount: 0,
      bytes: 0,
    },
    identity: { dev: '1', ino: folderId },
  });
  deps = {
    store,
    links: {
      driveZipEntry: (itemId, index, rev): MediaLink => link('view', itemId, index, rev),
      driveZipEntryDownload: (itemId, index, rev): MediaLink =>
        link('download', itemId, index, rev),
    },
  };
});

afterEach(async () => {
  await opened.close();
});

describe('listing an archive for a person', () => {
  it('pages the entries of an archive the person owns', async () => {
    const page = await listArchive(deps, robin, archiveId, undefined);
    expect(page.items.map((entry) => entry.path)).toEqual(['one.txt', 'two.png', 'locked.bin']);
    expect(page.next).toBeNull();
    expect(page.totals.files).toBe(3);
  });

  it('hides the archive from another person and refuses items that are not archives', async () => {
    await expect(listArchive(deps, sam, archiveId, undefined)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(listArchive(deps, robin, textId, undefined)).rejects.toBeInstanceOf(ApiError);
    await expect(listArchive(deps, robin, folderId, undefined)).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('entry links', () => {
  it('gives a view link and a download link to someone who may export', async () => {
    const result = await archiveEntryLink(deps, robin, archiveId, 1);
    expect(result.index).toBe(1);
    expect(result.file.url).toContain('kind=view');
    expect(result.download?.url).toContain('kind=download');
  });

  it('gives no download link for a locked archive shared as view only, and keeps the view link', async () => {
    opened.store.driveGrants.set(
      { itemId: archiveId, profileId: sam.profileId, role: 'view', expiresAt: null },
      robin.profileId,
    );
    expect((await archiveEntryLink(deps, sam, archiveId, 0)).download).not.toBeNull();
    opened.store.driveLocks.set(archiveId, robin.profileId, true);
    const locked = await archiveEntryLink(deps, sam, archiveId, 0);
    expect(locked.download).toBeNull();
    expect(locked.file.url).toContain('kind=view');
    expect((await archiveEntryLink(deps, robin, archiveId, 0)).download).not.toBeNull();
  });

  it('refuses an encrypted entry and an entry that is not there', async () => {
    await expect(archiveEntryLink(deps, robin, archiveId, 2)).rejects.toMatchObject({
      status: 400,
    });
    await expect(archiveEntryLink(deps, robin, archiveId, 40)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('reading the indexed text of an item', () => {
  it('says pending before the text is read, and gives the text after', async () => {
    const item = opened.store.driveItems.byId(textId, null);
    expect(await itemText(deps, robin, textId)).toMatchObject({
      state: 'pending',
      text: null,
      source: null,
    });
    opened.store.driveItemText.put({
      itemId: textId,
      rev: item.rev,
      source: 'document',
      state: 'ok',
      body: 'plain notes',
    });
    expect(await itemText(deps, robin, textId)).toMatchObject({
      state: 'ok',
      text: 'plain notes',
      chars: 11,
      source: 'document',
    });
  });

  it('says pending for text read from an older revision', async () => {
    opened.store.driveItemText.put({
      itemId: textId,
      rev: 99,
      source: 'document',
      state: 'ok',
      body: 'old',
    });
    expect(await itemText(deps, robin, textId)).toMatchObject({ state: 'pending', text: null });
  });

  it('reports a failure with its reason and no text', async () => {
    const item = opened.store.driveItems.byId(textId, null);
    opened.store.driveItemText.put({
      itemId: textId,
      rev: item.rev,
      source: 'document',
      state: 'failed',
      reason: 'damaged file',
    });
    expect(await itemText(deps, robin, textId)).toMatchObject({
      state: 'failed',
      reason: 'damaged file',
      text: null,
    });
  });

  it('keeps the text of another person file and of a locked view share to the one who may export', async () => {
    const item = opened.store.driveItems.byId(textId, null);
    opened.store.driveItemText.put({
      itemId: textId,
      rev: item.rev,
      source: 'document',
      state: 'ok',
      body: 'plain notes',
    });
    await expect(itemText(deps, sam, textId)).rejects.toThrow(ApiError);
    opened.store.driveGrants.set(
      { itemId: textId, profileId: sam.profileId, role: 'view', expiresAt: null },
      robin.profileId,
    );
    expect((await itemText(deps, sam, textId)).text).toBe('plain notes');
    opened.store.driveLocks.set(textId, robin.profileId, true);
    await expect(itemText(deps, sam, textId)).rejects.toThrow('view only');
    expect((await itemText(deps, robin, textId)).text).toBe('plain notes');
  });

  it('refuses a folder', async () => {
    await expect(itemText(deps, robin, folderId)).rejects.toThrow(ApiError);
  });
});
