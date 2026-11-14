import { describe, expect, it } from 'vitest';
import {
  DRIVE_ITEM,
  DRIVE_PLACEMENT,
  type DriveItem,
  type DrivePlacement,
} from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { rootRow, ROOT_ID, FOLDER_ID } from '../data/fixtures';
import {
  DEFAULT_SORT,
  NO_SELECTION,
  actionsOf,
  captionOf,
  columnSort,
  folderSubtitle,
  footerLine,
  itemsOfKind,
  kindChipsOf,
  moveFocus,
  placedComputersOf,
  placedFolderIdsOf,
  revealOffset,
  rowMarksOf,
  selectAllOf,
  selectOne,
  selectRange,
  sortItems,
  sortOfValue,
  sortValueOf,
  toggleOne,
  totalsOf,
  type ByName,
} from './folder-model';

const AT = '2026-11-07T10:00:00.000Z';
const SAM = 'b1b2c3d4-0000-4000-8000-000000000001';
const ALEX = 'b1b2c3d4-0000-4000-8000-000000000002';

function idOf(index: number): string {
  return `c1b2c3d4-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function base(index: number, name: string, modifiedAt: string, by: string | null): object {
  return {
    id: idOf(index),
    rootId: ROOT_ID,
    parentId: FOLDER_ID,
    relPath: `Projects/${name}`,
    name,
    modifiedAt,
    addedAt: AT,
    openedAt: null,
    starred: false,
    shared: false,
    rev: 1,
    etag: 'etag',
    outside: false,
    addedByProfileId: by,
    remoteId: null,
    remoteRev: null,
  };
}

interface Made {
  readonly modifiedAt?: string;
  readonly by?: string;
}

function file(index: number, name: string, size: number, made: Made = {}): DriveItem {
  return DRIVE_ITEM.parse({
    ...base(index, name, made.modifiedAt ?? AT, made.by ?? null),
    kind: 'document',
    mime: 'application/pdf',
    bytes: size,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
  });
}

function folder(index: number, name: string, children = 3): DriveItem {
  return DRIVE_ITEM.parse({
    ...base(index, name, AT, null),
    kind: 'folder',
    childCount: children,
    bytes: 10,
  });
}

const NAMES: ByName = (id) => (id === SAM ? 'Sam' : id === ALEX ? 'Alex' : null);

const names = (items: readonly DriveItem[]): readonly string[] => items.map((item) => item.name);

describe('folder sort', () => {
  const items = [
    file(1, 'b.pdf', 300, { modifiedAt: '2026-11-01T10:00:00.000Z', by: SAM }),
    folder(2, 'Zeta'),
    file(3, 'a10.pdf', 100, { modifiedAt: '2026-11-05T10:00:00.000Z', by: ALEX }),
    file(4, 'a9.pdf', 200, { modifiedAt: '2026-11-03T10:00:00.000Z' }),
    folder(5, 'Alpha'),
  ];

  it('keeps folders first and orders names naturally', () => {
    expect(names(sortItems(items, DEFAULT_SORT, NAMES))).toEqual([
      'Alpha',
      'Zeta',
      'a9.pdf',
      'a10.pdf',
      'b.pdf',
    ]);
  });

  it('keeps folders first when sorting by size, largest first', () => {
    const sorted = sortItems(items, { key: 'bytes', direction: 'desc' }, NAMES);
    expect(names(sorted)).toEqual(['Alpha', 'Zeta', 'b.pdf', 'a9.pdf', 'a10.pdf']);
  });

  it('sorts by who added the file and by modified time', () => {
    expect(names(sortItems(items, { key: 'by', direction: 'asc' }, NAMES)).slice(2)).toEqual([
      'a9.pdf',
      'a10.pdf',
      'b.pdf',
    ]);
    expect(
      names(sortItems(items, { key: 'modifiedAt', direction: 'desc' }, NAMES)).slice(2),
    ).toEqual(['a10.pdf', 'a9.pdf', 'b.pdf']);
  });

  it('flips a column on the second press and starts a new column at its natural direction', () => {
    expect(columnSort(DEFAULT_SORT, 'name')).toEqual({ key: 'name', direction: 'desc' });
    expect(columnSort(DEFAULT_SORT, 'modifiedAt')).toEqual({
      key: 'modifiedAt',
      direction: 'desc',
    });
  });

  it('round trips the sort chip value and rejects unknown values', () => {
    const sort = { key: 'bytes', direction: 'asc' } as const;
    expect(sortOfValue(sortValueOf(sort))).toEqual(sort);
    expect(sortOfValue('colour:up')).toEqual(DEFAULT_SORT);
  });
});

describe('folder selection ranges', () => {
  const order = ['a', 'b', 'c', 'd', 'e'];

  it('selects from the anchor to the clicked row in either direction', () => {
    const anchored = selectOne('b');
    expect([...selectRange(anchored, order, 'd').ids]).toEqual(['b', 'c', 'd']);
    expect([...selectRange(anchored, order, 'a').ids]).toEqual(['a', 'b']);
    expect(selectRange(anchored, order, 'd').anchor).toBe('b');
  });

  it('starts a new selection when there is no anchor', () => {
    expect([...selectRange(NO_SELECTION, order, 'c').ids]).toEqual(['c']);
  });

  it('toggles single rows and moves the anchor to them', () => {
    const one = toggleOne(selectOne('a'), 'c');
    expect([...one.ids]).toEqual(['a', 'c']);
    expect([...toggleOne(one, 'a').ids]).toEqual(['c']);
    expect(one.anchor).toBe('c');
  });

  it('moves the focus with the arrows and extends with shift', () => {
    expect([...moveFocus(NO_SELECTION, order, 1, false).ids]).toEqual(['a']);
    expect([...moveFocus(NO_SELECTION, order, -1, false).ids]).toEqual(['e']);
    expect([...moveFocus(selectOne('e'), order, 1, false).ids]).toEqual(['e']);
    const extended = moveFocus(moveFocus(selectOne('b'), order, 1, true), order, 1, true);
    expect([...extended.ids]).toEqual(['b', 'c', 'd']);
    expect(extended.focus).toBe('d');
  });

  it('selects everything shown', () => {
    expect(selectAllOf(order).ids.size).toBe(5);
    expect(moveFocus(NO_SELECTION, [], 1, false)).toBe(NO_SELECTION);
  });
});

describe('revealOffset', () => {
  const window = { offset: 560, viewport: 280 };

  it('leaves a row that is already in view where it is', () => {
    expect(revealOffset(10, 56, window)).toBeNull();
    expect(revealOffset(14, 56, window)).toBeNull();
  });

  it('scrolls up to a row above the view and down to one below it', () => {
    expect(revealOffset(9, 56, window)).toBe(504);
    expect(revealOffset(15, 56, window)).toBe(616);
    expect(revealOffset(99_999, 56, window)).toBe(99_999 * 56 + 56 - 280);
  });
});

describe('folder kinds and text', () => {
  const items = [folder(1, 'Quotes'), file(2, 'plan.pdf', 1024), file(3, 'cost.pdf', 2048)];

  it('counts kinds only once the folder is fully loaded', () => {
    expect(kindChipsOf(items, true)).toEqual([
      { kind: 'all', label: 'All', count: 3 },
      { kind: 'folder', label: 'Folders', count: 1 },
      { kind: 'document', label: 'Documents', count: 2 },
    ]);
    expect(kindChipsOf(items, false).map((chip) => chip.count)).toEqual([null, null, null]);
    expect(names(itemsOfKind(items, 'folder'))).toEqual(['Quotes']);
  });

  it('says how much is here, whether it is view only and how many computers hold it', () => {
    expect(folderSubtitle({ items: 48, bytes: 2_254_857_830 }, false, 3)).toBe(
      `48 items · ${bytes(2_254_857_830)} · on 3 computers`,
    );
    expect(folderSubtitle({ items: 1, bytes: 0 }, true, 0)).toBe(
      `1 item · ${bytes(0)} · view only`,
    );
    expect(footerLine({ items: 1200, bytes: 0 }, 6, 2)).toBe(
      `1,200 items · ${bytes(0)} · 6 shown · 2 selected`,
    );
  });

  it('takes totals from the open folder or the drive', () => {
    const root = rootRow(ROOT_ID, 'ready');
    expect(totalsOf(root, folder(1, 'Quotes', 9))).toEqual({ items: 9, bytes: 10 });
    expect(totalsOf(root, null)).toEqual({ items: root.items, bytes: root.bytes });
    expect(totalsOf(null, null)).toEqual({ items: 0, bytes: 0 });
  });

  it('says when a file changed outside SmartEverything', () => {
    const outside = DRIVE_ITEM.parse({ ...file(4, 'Budget.xlsx', 10), outside: true });
    expect(captionOf(outside)).toBe('Changed outside SmartEverything');
    expect(captionOf(folder(5, 'Quotes', 6))).toBe('6 items');
  });

  it('offers changes only where the folder can be written', () => {
    const item = file(6, 'plan.pdf', 10);
    expect(actionsOf(item, { writable: false, details: false })).toEqual([
      'open',
      'star',
      'download',
    ]);
    expect(actionsOf(folder(7, 'Quotes'), { writable: true, details: true })).toEqual([
      'open',
      'details',
      'star',
      'rename',
      'trash',
    ]);
  });

  it('marks starred, shared and placed rows in that order', () => {
    const plain = file(8, 'plan.pdf', 10);
    expect(rowMarksOf(plain, new Set())).toEqual([]);
    const marked = DRIVE_ITEM.parse({ ...plain, starred: true, shared: true });
    expect(rowMarksOf(marked, new Set([marked.id])).map((mark) => mark.label)).toEqual([
      'Starred',
      'Shared',
      'On a computer',
    ]);
  });

  it('finds the placed folders and the computers of one drive, enabled ones only', () => {
    const placement = (
      deviceId: string,
      folderItemId: string | null,
      enabled: boolean,
    ): DrivePlacement =>
      DRIVE_PLACEMENT.parse({
        id: idOf(40),
        deviceId,
        rootId: ROOT_ID,
        folderItemId,
        mode: 'mounted',
        localPath: '/home/me/Drive',
        enabled,
        hold: null,
        createdBy: SAM,
        createdAt: AT,
        status: {
          state: 'mounted',
          tier: 'full',
          basicLimits: null,
          readOnly: false,
          route: null,
          cacheBytes: 0,
          pinnedBytes: 0,
          openFiles: 0,
          pendingUploads: 0,
          needBytes: 0,
          lastSyncedAt: null,
          errors: [],
          reason: null,
          reportedAt: AT,
        },
      });
    const placements = [
      placement(SAM, FOLDER_ID, true),
      placement(SAM, null, true),
      placement(ALEX, idOf(3), false),
    ];
    expect([...placedFolderIdsOf(placements, ROOT_ID)]).toEqual([FOLDER_ID]);
    expect(placedComputersOf(placements, ROOT_ID)).toBe(1);
    expect(placedComputersOf(placements, idOf(9))).toBe(0);
  });
});
