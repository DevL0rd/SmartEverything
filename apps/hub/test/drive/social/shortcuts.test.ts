import type { DriveQuery } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BrowsePage } from '../../../src/drive/service-read';
import { driveHits } from '../../../src/drive/search-provider';
import { DriveShortcuts, shortcutsForQuery } from '../../../src/drive/social/shortcuts';
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
  shortcuts = new DriveShortcuts({ store: social.opened.store });
});

afterEach(async () => {
  await social.opened.close();
});

async function inRobinDocs(): Promise<BrowsePage> {
  return await social.read.browseFolder(social.robin, {
    rootId: ROBIN_DRIVE,
    folderId: ROBIN_FOLDER,
  });
}

describe('shortcuts', () => {
  it('shows a file of another drive in a folder without copying it', async () => {
    share(social, TRIP, social.robin, 'view');
    const created = await shortcuts.create(
      { ...social.robin, via: 'app' },
      {
        targetItemId: TRIP_FILE,
        place: { kind: 'folder', folderId: ROBIN_FOLDER },
        name: 'Trip notes',
      },
    );
    expect(created.target).toMatchObject({ state: 'available', item: { id: TRIP_FILE } });
    const page = await inRobinDocs();
    expect(page.items).toHaveLength(0);
    expect(page.shortcuts.map((shortcut) => shortcut.name)).toEqual(['Trip notes']);
    expect(
      (await social.read.browseFolder(social.robin, { rootId: ROBIN_DRIVE })).shortcuts,
    ).toEqual([]);
  });

  it('needs read access to the target and write access to the folder', async () => {
    await expect(
      shortcuts.create(
        { ...social.robin, via: 'app' },
        {
          targetItemId: SECRET,
          place: { kind: 'drive', rootId: ROBIN_DRIVE },
          name: 's',
        },
      ),
    ).rejects.toThrow(/no such/);
    share(social, TRIP, social.robin, 'view');
    await expect(
      shortcuts.create(
        { ...social.robin, via: 'app' },
        {
          targetItemId: ROBIN_FILE,
          place: { kind: 'folder', folderId: TRIP },
          name: 's',
        },
      ),
    ).rejects.toThrow(/cannot add or change/);
    share(social, TRIP, social.robin, 'edit');
    expect(
      (
        await shortcuts.create(
          { ...social.robin, via: 'app' },
          {
            targetItemId: ROBIN_FILE,
            place: { kind: 'folder', folderId: TRIP },
            name: 's',
          },
        )
      ).parentId,
    ).toBe(TRIP);
  });

  it('refuses a name already used by a shortcut or a real item in the folder', async () => {
    await shortcuts.create(
      { ...social.robin, via: 'app' },
      {
        targetItemId: ROBIN_FILE,
        place: { kind: 'drive', rootId: ROBIN_DRIVE },
        name: 'twin',
      },
    );
    await expect(
      shortcuts.create(
        { ...social.robin, via: 'app' },
        {
          targetItemId: ROBIN_FILE,
          place: { kind: 'drive', rootId: ROBIN_DRIVE },
          name: 'twin',
        },
      ),
    ).rejects.toThrow(/already in that folder/);
    await expect(
      shortcuts.create(
        { ...social.robin, via: 'app' },
        {
          targetItemId: ROBIN_FOLDER,
          place: { kind: 'drive', rootId: ROBIN_DRIVE },
          name: 'mine.txt',
        },
      ),
    ).rejects.toThrow(/already in that folder/);
  });

  it('renames, moves and removes a shortcut and leaves the target alone', async () => {
    const made = await shortcuts.create(
      { ...social.robin, via: 'app' },
      {
        targetItemId: ROBIN_FILE,
        place: { kind: 'drive', rootId: ROBIN_DRIVE },
        name: 'first',
      },
    );
    const renamed = await shortcuts.update(social.robin, made.id, { name: 'second' });
    expect(renamed.name).toBe('second');
    const moved = await shortcuts.update(social.robin, made.id, {
      place: { kind: 'folder', folderId: ROBIN_FOLDER },
    });
    expect(moved.parentId).toBe(ROBIN_FOLDER);
    await shortcuts.remove(social.robin, made.id);
    expect((await inRobinDocs()).shortcuts).toEqual([]);
    expect(social.opened.store.driveItems.find(ROBIN_FILE, null)).toBeDefined();
  });

  it('does not let another person change a shortcut they cannot write', async () => {
    const made = await shortcuts.create(
      { ...social.robin, via: 'app' },
      {
        targetItemId: ROBIN_FILE,
        place: { kind: 'drive', rootId: ROBIN_DRIVE },
        name: 'first',
      },
    );
    await expect(shortcuts.remove(social.sam, made.id)).rejects.toThrow(/no such drive/);
  });

  it('shows a shortcut whose target the viewer can no longer open, with the reason', async () => {
    share(social, TRIP, social.robin, 'view');
    await shortcuts.create(
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
      (await social.read.browseFolder(social.robin, { rootId: ROBIN_DRIVE })).shortcuts[0]?.target,
    ).toEqual({
      state: 'unavailable',
      reason: 'no_access',
    });
  });

  it('shows a shortcut whose target is in the trash with the trashed reason', async () => {
    const made = await shortcuts.create(
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
    expect(
      (await inRobinDocs()).shortcuts.find((shortcut) => shortcut.id === made.id)?.target,
    ).toEqual({
      state: 'unavailable',
      reason: 'trashed',
    });
  });

  it('is only on the first page of a folder', async () => {
    await shortcuts.create(
      { ...social.robin, via: 'app' },
      {
        targetItemId: ROBIN_FILE,
        place: { kind: 'drive', rootId: ROBIN_DRIVE },
        name: 'first',
      },
    );
    const page = await social.read.browseFolder(social.robin, { rootId: ROBIN_DRIVE });
    expect(page.shortcuts).toHaveLength(1);
  });

  it('is found by its name in search and points at the target', async () => {
    share(social, TRIP, social.robin, 'view');
    await shortcuts.create(
      { ...social.robin, via: 'app' },
      {
        targetItemId: TRIP_FILE,
        place: { kind: 'drive', rootId: ROBIN_DRIVE },
        name: 'Holiday plans',
      },
    );
    await shortcuts.create(
      { ...social.robin, via: 'app' },
      {
        targetItemId: ROBIN_FILE,
        place: { kind: 'drive', rootId: ROBIN_DRIVE },
        name: 'Budget',
      },
    );
    const { store } = social.opened;
    const found = await shortcutsForQuery(store, social.robin, { ...QUERY, text: 'holiday PLANS' });
    expect(found.map((shortcut) => shortcut.name)).toEqual(['Holiday plans']);
    expect(
      await shortcutsForQuery(store, social.robin, {
        ...QUERY,
        text: 'holiday',
        rootId: SAM_DRIVE,
      }),
    ).toEqual([]);
    expect(await shortcutsForQuery(store, social.sam, { ...QUERY, text: 'holiday' })).toEqual([]);
  });

  describe('in the search of the drive', () => {
    async function holidayShortcut(): Promise<void> {
      share(social, TRIP, social.robin, 'view');
      await shortcuts.create(
        { ...social.robin, via: 'app' },
        {
          targetItemId: TRIP_FILE,
          place: { kind: 'folder', folderId: ROBIN_FOLDER },
          name: 'Holiday plans',
        },
      );
    }

    it('comes with a name search, honouring the drive, the folder and the first page', async () => {
      await holidayShortcut();
      const names = async (query: DriveQuery): Promise<string[]> =>
        (await shortcutsForQuery(social.opened.store, social.robin, query)).map(
          (shortcut) => shortcut.name,
        );
      expect(await names(QUERY)).toEqual(['Holiday plans']);
      expect(await names({ ...QUERY, rootId: ROBIN_DRIVE })).toEqual(['Holiday plans']);
      expect(await names({ ...QUERY, rootId: SAM_DRIVE })).toEqual([]);
      expect(await names({ ...QUERY, folderId: ROBIN_FOLDER })).toEqual(['Holiday plans']);
      expect(await names({ ...QUERY, folderId: TRIP })).toEqual([]);
      expect(await names({ ...QUERY, cursor: 'next' })).toEqual([]);
      expect(await names({ ...QUERY, text: null })).toEqual([]);
      expect(await names({ ...QUERY, kinds: ['image'] })).toEqual([]);
    });

    it('is hidden from someone without access and once the target is lost', async () => {
      await holidayShortcut();
      expect(await shortcutsForQuery(social.opened.store, social.sam, QUERY)).toEqual([]);
      social.opened.store.driveGrants.remove(
        social.opened.store.driveGrants.forPerson(TRIP, social.robin.profileId)?.id ?? '',
      );
      expect(await shortcutsForQuery(social.opened.store, social.robin, QUERY)).toEqual([]);
    });

    it('is a hit of the global search that points at the target', async () => {
      await holidayShortcut();
      const { store } = social.opened;
      const hits = await driveHits(
        (viewer, query, limit) => store.host.call('driveSearch', 'search', viewer, query, limit),
        social.robin,
        { query: 'holiday', limit: 5 },
        (viewer, query) => shortcutsForQuery(social.opened.store, viewer, query),
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
