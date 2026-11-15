import type { DriveQuery } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BrowsePage } from '../../../src/drive/service-read';
import { driveHits } from '../../../src/drive/search-provider';
import {
  DriveShortcuts,
  shortcutsForQuery,
  type ShortcutsEnv,
} from '../../../src/drive/social/shortcuts';
import {
  ROBIN_DRIVE,
  ROBIN_FILE,
  ROBIN_FOLDER,
  SAM_DRIVE,
  SECRET,
  TRIP,
  TRIP_FILE,
  openSocial,
  share,
  type Social,
} from './social-fixture';

const QUERY: DriveQuery = {
  text: 'holiday',
  match: 'all',
  rootId: null,
  folderId: null,
  kinds: null,
  starred: null,
  duration: null,
  taken: null,
  sort: { field: 'modifiedAt', direction: 'desc' },
  cursor: null,
};

let social: Social;
let shortcuts: DriveShortcuts;

beforeEach(async () => {
  social = await openSocial();
  shortcuts = new DriveShortcuts({
    store: social.opened.store,
    context: social.opened.store.context,
    read: social.read,
  });
});

afterEach(async () => {
  await social.opened.close();
});

function inRobinDocs(): BrowsePage {
  return social.read.browseFolder(social.robin, { rootId: ROBIN_DRIVE, folderId: ROBIN_FOLDER });
}

describe('shortcuts', () => {
  it('shows a file of another drive in a folder without copying it', () => {
    share(social, TRIP, social.robin, 'view');
    const created = shortcuts.create(
      { ...social.robin, via: 'app' },
      {
        targetItemId: TRIP_FILE,
        place: { kind: 'folder', folderId: ROBIN_FOLDER },
        name: 'Trip notes',
      },
    );
    expect(created.target).toMatchObject({ state: 'available', item: { id: TRIP_FILE } });
    const page = inRobinDocs();
    expect(page.items).toHaveLength(0);
    expect(page.shortcuts.map((shortcut) => shortcut.name)).toEqual(['Trip notes']);
    expect(social.read.browseFolder(social.robin, { rootId: ROBIN_DRIVE }).shortcuts).toEqual([]);
  });

  it('needs read access to the target and write access to the folder', () => {
    expect(() =>
      shortcuts.create(
        { ...social.robin, via: 'app' },
        {
          targetItemId: SECRET,
          place: { kind: 'drive', rootId: ROBIN_DRIVE },
          name: 's',
        },
      ),
    ).toThrow(/no such/);
    share(social, TRIP, social.robin, 'view');
    expect(() =>
      shortcuts.create(
        { ...social.robin, via: 'app' },
        {
          targetItemId: ROBIN_FILE,
          place: { kind: 'folder', folderId: TRIP },
          name: 's',
        },
      ),
    ).toThrow(/cannot add or change/);
    share(social, TRIP, social.robin, 'edit');
    expect(
      shortcuts.create(
        { ...social.robin, via: 'app' },
        {
          targetItemId: ROBIN_FILE,
          place: { kind: 'folder', folderId: TRIP },
          name: 's',
        },
      ).parentId,
    ).toBe(TRIP);
  });

  it('refuses a name already used by a shortcut or a real item in the folder', () => {
    shortcuts.create(
      { ...social.robin, via: 'app' },
      {
        targetItemId: ROBIN_FILE,
        place: { kind: 'drive', rootId: ROBIN_DRIVE },
        name: 'twin',
      },
    );
    expect(() =>
      shortcuts.create(
        { ...social.robin, via: 'app' },
        {
          targetItemId: ROBIN_FILE,
          place: { kind: 'drive', rootId: ROBIN_DRIVE },
          name: 'twin',
        },
      ),
    ).toThrow(/already in that folder/);
    expect(() =>
      shortcuts.create(
        { ...social.robin, via: 'app' },
        {
          targetItemId: ROBIN_FOLDER,
          place: { kind: 'drive', rootId: ROBIN_DRIVE },
          name: 'mine.txt',
        },
      ),
    ).toThrow(/already in that folder/);
  });

  it('renames, moves and removes a shortcut and leaves the target alone', () => {
    const made = shortcuts.create(
      { ...social.robin, via: 'app' },
      {
        targetItemId: ROBIN_FILE,
        place: { kind: 'drive', rootId: ROBIN_DRIVE },
        name: 'first',
      },
    );
    const renamed = shortcuts.update(social.robin, made.id, { name: 'second' });
    expect(renamed.name).toBe('second');
    const moved = shortcuts.update(social.robin, made.id, {
      place: { kind: 'folder', folderId: ROBIN_FOLDER },
    });
    expect(moved.parentId).toBe(ROBIN_FOLDER);
    shortcuts.remove(social.robin, made.id);
    expect(inRobinDocs().shortcuts).toEqual([]);
    expect(social.opened.store.driveItems.find(ROBIN_FILE, null)).toBeDefined();
  });

  it('does not let another person change a shortcut they cannot write', () => {
    const made = shortcuts.create(
      { ...social.robin, via: 'app' },
      {
        targetItemId: ROBIN_FILE,
        place: { kind: 'drive', rootId: ROBIN_DRIVE },
        name: 'first',
      },
    );
    expect(() => {
      shortcuts.remove(social.sam, made.id);
    }).toThrow(/no such drive/);
  });

  it('shows a shortcut whose target the viewer can no longer open, with the reason', () => {
    share(social, TRIP, social.robin, 'view');
    shortcuts.create(
      { ...social.robin, via: 'app' },
      {
        targetItemId: TRIP_FILE,
        place: { kind: 'drive', rootId: ROBIN_DRIVE },
        name: 'trip',
      },
    );
    social.opened.store.driveGrants.remove(
      social.opened.store.driveGrants.forPerson(TRIP, social.robin.profileId)?.id ?? '',
    );
    expect(
      social.read.browseFolder(social.robin, { rootId: ROBIN_DRIVE }).shortcuts[0]?.target,
    ).toEqual({
      state: 'unavailable',
      reason: 'no_access',
    });
  });

  it('shows a shortcut whose target is in the trash with the trashed reason', () => {
    const made = shortcuts.create(
      { ...social.robin, via: 'app' },
      {
        targetItemId: ROBIN_FILE,
        place: { kind: 'folder', folderId: ROBIN_FOLDER },
        name: 'mine',
      },
    );
    const { store } = social.opened;
    store.context.write(() => {
      store.driveTrash.insert({
        itemId: ROBIN_FILE,
        rootId: ROBIN_DRIVE,
        name: 'mine.txt',
        originalRelPath: 'mine.txt',
        trashRelPath: '.trash/mine',
        isFolder: false,
        bytes: 10,
        deletedAt: '2026-11-07T00:00:00.000Z',
        purgeAt: '2026-12-07T00:00:00.000Z',
        deletedBy: null,
        addedByProfileId: null,
      });
      store.driveItems.remove(ROBIN_FILE);
    });
    expect(inRobinDocs().shortcuts.find((shortcut) => shortcut.id === made.id)?.target).toEqual({
      state: 'unavailable',
      reason: 'trashed',
    });
  });

  it('is only on the first page of a folder', () => {
    shortcuts.create(
      { ...social.robin, via: 'app' },
      {
        targetItemId: ROBIN_FILE,
        place: { kind: 'drive', rootId: ROBIN_DRIVE },
        name: 'first',
      },
    );
    const page = social.read.browseFolder(social.robin, { rootId: ROBIN_DRIVE });
    expect(page.shortcuts).toHaveLength(1);
  });

  it('is found by its name in search and points at the target', () => {
    share(social, TRIP, social.robin, 'view');
    shortcuts.create(
      { ...social.robin, via: 'app' },
      {
        targetItemId: TRIP_FILE,
        place: { kind: 'drive', rootId: ROBIN_DRIVE },
        name: 'Holiday plans',
      },
    );
    shortcuts.create(
      { ...social.robin, via: 'app' },
      {
        targetItemId: ROBIN_FILE,
        place: { kind: 'drive', rootId: ROBIN_DRIVE },
        name: 'Budget',
      },
    );
    const found = shortcuts.matching(social.robin, 'holiday PLANS', { rootId: null });
    expect(found.map((shortcut) => shortcut.name)).toEqual(['Holiday plans']);
    expect(shortcuts.matching(social.robin, 'holiday', { rootId: SAM_DRIVE })).toEqual([]);
    expect(shortcuts.matching(social.sam, 'holiday', { rootId: null })).toEqual([]);
  });

  describe('in the search of the drive', () => {
    function holidayShortcut(): void {
      share(social, TRIP, social.robin, 'view');
      shortcuts.create(
        { ...social.robin, via: 'app' },
        {
          targetItemId: TRIP_FILE,
          place: { kind: 'folder', folderId: ROBIN_FOLDER },
          name: 'Holiday plans',
        },
      );
    }

    function env(): Pick<ShortcutsEnv, 'store' | 'context'> {
      const { store } = social.opened;
      return { store, context: store.context };
    }

    it('comes with a name search, honouring the drive, the folder and the first page', () => {
      holidayShortcut();
      const names = (query: DriveQuery): string[] =>
        shortcutsForQuery(env(), social.robin, query).map((shortcut) => shortcut.name);
      expect(names(QUERY)).toEqual(['Holiday plans']);
      expect(names({ ...QUERY, rootId: ROBIN_DRIVE })).toEqual(['Holiday plans']);
      expect(names({ ...QUERY, rootId: SAM_DRIVE })).toEqual([]);
      expect(names({ ...QUERY, folderId: ROBIN_FOLDER })).toEqual(['Holiday plans']);
      expect(names({ ...QUERY, folderId: TRIP })).toEqual([]);
      expect(names({ ...QUERY, cursor: 'next' })).toEqual([]);
      expect(names({ ...QUERY, text: null })).toEqual([]);
      expect(names({ ...QUERY, kinds: ['image'] })).toEqual([]);
    });

    it('is hidden from someone without access and once the target is lost', () => {
      holidayShortcut();
      expect(shortcutsForQuery(env(), social.sam, QUERY)).toEqual([]);
      social.opened.store.driveGrants.remove(
        social.opened.store.driveGrants.forPerson(TRIP, social.robin.profileId)?.id ?? '',
      );
      expect(shortcutsForQuery(env(), social.robin, QUERY)).toEqual([]);
    });

    it('is a hit of the global search that points at the target', () => {
      holidayShortcut();
      const { store } = social.opened;
      const hits = driveHits(
        store.driveSearch,
        social.robin,
        { query: 'holiday', limit: 5 },
        (viewer, query) => shortcutsForQuery(env(), viewer, query),
      );
      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatchObject({
        name: 'Holiday plans',
        kind: 'document',
        shortcut: true,
        rootId: ROBIN_DRIVE,
        target: { kind: 'drive', rootId: SAM_DRIVE, itemId: TRIP_FILE },
      });
    });
  });
});
