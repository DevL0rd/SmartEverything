import {
  DRIVE_QUERY_PAGE,
  DRIVE_SNIPPET_CLOSE,
  DRIVE_SNIPPET_OPEN,
  type DriveItem,
  type DriveQueryPage,
  type DriveQuery,
} from '@smarteverything/domain';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DriveActor } from '../../../src/drive/access';
import { DriveSearch, driveSearchDocument } from '../../../src/drive/search';
import { driveHits } from '../../../src/drive/search-provider';
import { StoreContext } from '../../../src/store/context';
import { ChangeFeed } from '../../../src/store/feed';
import { migrate } from '../../../src/store/migrate';
import { MIGRATIONS } from '../../../src/store/migrations';
import { DriveGrantsRepository } from '../../../src/store/repositories/drive-grants';
import { DriveItemTextRepository } from '../../../src/store/repositories/drive-item-text';
import {
  DriveItemsRepository,
  type DriveItemDraft,
} from '../../../src/store/repositories/drive-items';
import { DriveRootsRepository } from '../../../src/store/repositories/drive-roots';
import { ProfilesRepository } from '../../../src/store/repositories/profiles';
import { Sql } from '../../../src/store/sql';
import { testLogger } from '../../support/logs';
import { driveFolders, personalDriveRoot, sharedDriveRoot } from '../../store/drive-roots-fixture';

const NOW = '2026-11-07T00:00:00.000Z';
const HOME = '0d000000-0000-4000-8000-000000000001';
const ROBIN_ROOT = '0d000000-0000-4000-8000-000000000002';
const SAM_ROOT = '0d000000-0000-4000-8000-000000000003';

let database: DatabaseSync;
let items: DriveItemsRepository;
let texts: DriveItemTextRepository;
let grants: DriveGrantsRepository;
let search: DriveSearch;
let robin: DriveActor;
let sam: DriveActor;
let stranger: DriveActor;

function id(index: number): string {
  return `0e000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function draft(
  index: number,
  name: string,
  rootId: string,
  fields: { kind?: 'document' | 'image'; parentId?: string | null; relPath?: string } = {},
): DriveItemDraft {
  const base = {
    id: id(index),
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
    bytes: 10,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
  } as const;
  return fields.kind === 'image'
    ? {
        ...base,
        kind: 'image',
        mime: 'image/png',
        takenAt: null,
        width: 10,
        height: 10,
        orientation: null,
        camera: null,
        exposure: null,
        place: null,
      }
    : { ...base, kind: 'document', mime: 'text/plain' };
}

function folderDraft(index: number, name: string, rootId: string): DriveItemDraft {
  return {
    id: id(index),
    rootId,
    parentId: null,
    relPath: name,
    name,
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
  };
}

function put(
  item: DriveItemDraft,
  body?: string,
  source: 'document' | 'image' = 'document',
): DriveItem {
  const { item: written } = items.write({ item, identity: { dev: '1', ino: item.id } });
  const entry = driveSearchDocument(written, []);
  database
    .prepare(
      'insert into drive_items_search (item_id, name, path, camera, albums, dates) values (?, ?, ?, ?, ?, ?)',
    )
    .run(entry.itemId, entry.name, entry.path, entry.camera, entry.albums, entry.dates);
  if (body !== undefined)
    texts.put({ itemId: written.id, rev: written.rev, source, state: 'ok', body });
  return written;
}

function query(fields: Partial<DriveQuery> = {}): DriveQuery {
  return {
    text: null,
    match: 'all',
    rootId: null,
    folderId: null,
    kinds: null,
    starred: null,
    duration: null,
    taken: null,
    sort: { field: 'name', direction: 'asc' },
    cursor: null,
    ...fields,
  };
}

function find(
  viewer: DriveActor,
  text: string,
  match: DriveQuery['match'] = 'all',
): DriveQueryPage {
  return search.search(viewer, query({ text, match }), 100);
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  const context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(new Sql(database), MIGRATIONS, NOW, log);
  items = new DriveItemsRepository(context);
  texts = new DriveItemTextRepository(context);
  grants = new DriveGrantsRepository(context);
  search = new DriveSearch(context);
  const profiles = new ProfilesRepository(context);
  const robinId = profiles.create({ name: 'Robin' }).id;
  const samId = profiles.create({ name: 'Sam' }).id;
  const strangerId = profiles.create({ name: 'Owner' }).id;
  robin = { profileId: robinId };
  sam = { profileId: samId };
  stranger = { profileId: strangerId };
  const roots = new DriveRootsRepository(context, driveFolders);
  roots.insert(sharedDriveRoot(HOME));
  roots.insert(personalDriveRoot(ROBIN_ROOT, robinId));
  roots.insert(personalDriveRoot(SAM_ROOT, samId));
});

afterEach(() => {
  database.close();
});

describe('searching inside files', () => {
  it('finds text inside a document and says where, with a highlighted snippet', () => {
    put(draft(1, 'letter.docx', ROBIN_ROOT), 'The harbour lighthouse keeper wrote about storms.');
    const page = find(robin, 'lighthouse');
    expect(page.items.map((item) => item.name)).toEqual(['letter.docx']);
    expect(DRIVE_QUERY_PAGE.parse(page)).toEqual(page);
    const [hit] = page.hits;
    expect(hit?.where).toBe('text');
    expect(hit?.snippet).toContain(`${DRIVE_SNIPPET_OPEN}lighthouse${DRIVE_SNIPPET_CLOSE}`);
  });

  it('marks text read out of an image as image text', () => {
    put(draft(2, 'receipt.png', ROBIN_ROOT, { kind: 'image' }), 'Total 42 harbour cafe', 'image');
    const [hit] = find(robin, 'cafe').hits;
    expect(hit?.where).toBe('image_text');
    expect(hit?.snippet).toContain(`${DRIVE_SNIPPET_OPEN}cafe${DRIVE_SNIPPET_CLOSE}`);
  });

  it('reports a name match as a name hit even when the text matches as well', () => {
    put(draft(3, 'lighthouse.txt', ROBIN_ROOT), 'a lighthouse in the text');
    expect(find(robin, 'lighthouse').hits).toEqual([
      { itemId: id(3), where: 'name', snippet: null },
    ]);
  });

  it('searches names only when asked', () => {
    put(draft(4, 'plain.txt', ROBIN_ROOT), 'secret lighthouse');
    expect(find(robin, 'lighthouse', 'names').items).toEqual([]);
    expect(find(robin, 'lighthouse', 'all').items.map((item) => item.name)).toEqual(['plain.txt']);
  });

  it('returns a name hit for every item of a search with no text', () => {
    put(draft(5, 'a.txt', ROBIN_ROOT), 'lighthouse');
    const page = search.search(robin, query(), 100);
    expect(page.hits).toEqual([{ itemId: id(5), where: 'name', snippet: null }]);
  });

  it('finds prefixes, ignores accents, and refuses a search with no words', () => {
    put(draft(6, 'menu.txt', ROBIN_ROOT), 'Crème brûlée recipe');
    expect(find(robin, 'creme brul').items).toHaveLength(1);
    expect(find(robin, ' - ').items).toEqual([]);
    expect(find(robin, ' - ').hits).toEqual([]);
  });

  it('keeps one result per item when many words match', () => {
    put(draft(7, 'repeat.txt', ROBIN_ROOT), 'tea tea tea');
    expect(find(robin, 'tea').items).toHaveLength(1);
  });

  it('stops finding text after the item loses its text row', () => {
    put(draft(8, 'old.txt', ROBIN_ROOT), 'vanishing words');
    texts.remove(id(8));
    expect(find(robin, 'vanishing').items).toEqual([]);
  });
});

describe('who can find text', () => {
  it('lets nobody but the owner of a personal drive find its text, the hub owner profile included', () => {
    put(draft(10, 'private.txt', ROBIN_ROOT), 'robin private lighthouse');
    expect(find(robin, 'private').items).toHaveLength(1);
    expect(find(sam, 'private').items).toEqual([]);
    expect(find(stranger, 'private').items).toEqual([]);
  });

  it('shows text of the shared drive to everyone', () => {
    put(draft(11, 'house.txt', HOME), 'shared harbour notes');
    expect(find(sam, 'harbour').items).toHaveLength(1);
    expect(find(stranger, 'harbour').items).toHaveLength(1);
  });

  it('opens the text of a shared folder to the grantee and only that folder', () => {
    const folder = put(folderDraft(12, 'trip', ROBIN_ROOT));
    put(
      draft(13, 'plan.txt', ROBIN_ROOT, { parentId: folder.id, relPath: 'trip/plan.txt' }),
      'granted lighthouse',
    );
    put(draft(14, 'other.txt', ROBIN_ROOT), 'ungranted lighthouse');
    expect(find(sam, 'lighthouse').items).toEqual([]);
    grants.set(
      { itemId: folder.id, profileId: sam.profileId, role: 'view', expiresAt: null },
      robin.profileId,
    );
    expect(find(sam, 'lighthouse').items.map((item) => item.name)).toEqual(['plan.txt']);
  });
});

describe('global search hits', () => {
  it('carries the text snippet without highlight markers as the subtitle of a content hit', async () => {
    put(draft(20, 'letter.docx', ROBIN_ROOT), 'The lighthouse keeper');
    put(draft(21, 'lighthouse notes.txt', ROBIN_ROOT));
    const hits = await driveHits(
      (viewer, query, limit) => Promise.resolve(search.search(viewer, query, limit)),
      robin,
      { query: 'lighthouse', limit: 10 },
      () => Promise.resolve([]),
    );
    const byName = new Map(hits.map((hit) => [hit.name, hit]));
    expect(byName.get('letter.docx')?.subtitle).toContain('lighthouse keeper');
    expect(byName.get('letter.docx')?.subtitle).not.toContain(DRIVE_SNIPPET_OPEN);
    expect(byName.get('lighthouse notes.txt')?.subtitle).toBeUndefined();
  });
});
