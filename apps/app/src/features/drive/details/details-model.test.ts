import { describe, expect, it } from 'vitest';
import {
  DRIVE_ITEM,
  DRIVE_VERSION,
  type DriveItem,
  type DriveVersion,
} from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { FOLDER_ID, ROOT_ID } from '../data/fixtures';
import type { ByName } from '../folder/folder-model';
import {
  DETAILS_TABS,
  EDIT_DAYS,
  PREVIEW_HEAD_BYTES,
  activeTabOf,
  changedByOf,
  columnNameOf,
  coversItem,
  editWindowStart,
  editsPerDay,
  editsTotal,
  headIsWhole,
  headLinesOf,
  integrityOf,
  kindTextOf,
  needsOlderVersions,
  placementRingOf,
  presentationOf,
  previewBodyOf,
  quickActionsOf,
  readRememberedTab,
  rememberTab,
  sheetDelimiterOf,
  sheetHeadOf,
  subjectOf,
  tabsOf,
  whereOf,
  whoSeesOf,
} from './details-model';

const AT = '2026-11-07T10:00:00.000Z';
const SAM = 'b1b2c3d4-0000-4000-8000-000000000001';
const ME = 'b1b2c3d4-0000-4000-8000-000000000002';
const LAPTOP = 'd1b2c3d4-0000-4000-8000-000000000001';

const NAMES: ByName = (id) => (id === SAM ? 'Sam' : id === ME ? 'Robin' : null);

function idOf(index: number): string {
  return `c1b2c3d4-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function base(index: number, name: string, extra: object = {}): object {
  return {
    id: idOf(index),
    rootId: ROOT_ID,
    parentId: FOLDER_ID,
    relPath: `Home/Kitchen/${name}`,
    name,
    modifiedAt: AT,
    addedAt: AT,
    openedAt: null,
    starred: false,
    shared: false,
    rev: 3,
    etag: 'etag',
    outside: false,
    addedByProfileId: SAM,
    remoteId: null,
    remoteRev: null,
    ...extra,
  };
}

function image(index: number, name: string, extra: object = {}): DriveItem {
  return DRIVE_ITEM.parse({
    ...base(index, name, extra),
    kind: 'image',
    mime: 'image/jpeg',
    bytes: 3_400_000,
    sha256: null,
    integrity: 'ok',
    thumb: { state: 'ready' },
    takenAt: null,
    width: 4032,
    height: 3024,
    orientation: null,
    camera: null,
    exposure: null,
    place: null,
  });
}

function document(index: number, name: string, mime: string, size = 100): DriveItem {
  return DRIVE_ITEM.parse({
    ...base(index, name),
    kind: 'document',
    mime,
    bytes: size,
    sha256: null,
    integrity: 'ok',
    thumb: { state: 'none' },
  });
}

function folder(index: number, name: string): DriveItem {
  return DRIVE_ITEM.parse({ ...base(index, name), kind: 'folder', childCount: 4, bytes: 10 });
}

function version(rev: number, at: string, extra: object = {}): DriveVersion {
  return DRIVE_VERSION.parse({
    id: idOf(100 + rev),
    itemId: idOf(1),
    rev,
    sha256: 'a'.repeat(64),
    bytes: 100,
    at,
    purgeAt: '2027-11-07T10:00:00.000Z',
    actorProfileId: SAM,
    via: 'app',
    deviceId: LAPTOP,
    addedByProfileId: SAM,
    ...extra,
  });
}

describe('details tabs', () => {
  it('shows every tab for a file, Sharing included', () => {
    expect(tabsOf(image(1, 'a.jpg'))).toEqual(DETAILS_TABS);
  });

  it('leaves out Preview and Versions for a folder', () => {
    expect(tabsOf(folder(2, 'Quotes'))).toEqual(['info', 'activity', 'sharing']);
  });

  it('remembers the last tab and falls back to Info when it is missing', () => {
    rememberTab('versions');
    expect(readRememberedTab()).toBe('versions');
    expect(activeTabOf(readRememberedTab(), tabsOf(image(1, 'a.jpg')))).toBe('versions');
    expect(activeTabOf(readRememberedTab(), tabsOf(folder(2, 'Quotes')))).toBe('info');
    rememberTab('info');
  });
});

describe('selection follow', () => {
  const a = image(1, 'a.jpg');
  const b = image(2, 'b.jpg');
  const here = folder(3, 'Kitchen');

  it('follows the focused row first', () => {
    expect(subjectOf({ focused: b, picked: [a, b], folder: here })).toBe(b);
  });

  it('follows the last picked row when nothing is focused', () => {
    expect(subjectOf({ focused: null, picked: [b, a], folder: here })).toBe(a);
  });

  it('shows the open folder when nothing is picked, and nothing at the top of a root', () => {
    expect(subjectOf({ focused: null, picked: [], folder: here })).toBe(here);
    expect(subjectOf({ focused: null, picked: [], folder: null })).toBeNull();
  });
});

describe('presentation', () => {
  it('uses the pull-up on phones, the side sheet below 1024 and the docked pane from 1024', () => {
    expect(presentationOf('compact', 1400)).toBe('pull-up');
    expect(presentationOf('icon', 884)).toBe('sheet');
    expect(presentationOf('wide', 1023)).toBe('sheet');
    expect(presentationOf('wide', 1024)).toBe('docked');
  });
});

describe('info lines', () => {
  const item = image(1, 'Island sketch v4.jpg');

  it('names the kind from the extension', () => {
    expect(kindTextOf(item)).toBe('JPG image');
    expect(kindTextOf(folder(2, 'Quotes'))).toBe('Folder');
  });

  it('writes where the item is in its drive, and only the share for an item shared with me', () => {
    expect(whereOf({ item, label: 'My Drive', access: 'own' })).toBe('My Drive › Home › Kitchen');
    expect(whereOf({ item, label: 'Shared Drive', access: 'shared' })).toBe(
      'Shared Drive › Home › Kitchen',
    );
    expect(whereOf({ item, label: 'Sam’s file', access: 'view' })).toBe(
      'Shared with me › Sam’s file',
    );
  });

  it('says who sees an item of the Shared Drive, of my drive and one shared with me', () => {
    const who = { ownerName: 'Sam', people: [] };
    expect(whoSeesOf({ ...who, access: 'shared' })).toBe('Everyone in the home');
    expect(whoSeesOf({ ...who, access: 'own' })).toBe('Only you');
    expect(whoSeesOf({ ...who, access: 'own', people: ['Sam'] })).toBe('You and Sam');
    expect(whoSeesOf({ ...who, access: 'own', people: ['Sam', 'Robin', 'Ada'] })).toBe(
      'You and Sam, Robin and Ada',
    );
    expect(whoSeesOf({ ...who, access: 'edit' })).toBe('Shared with you by Sam · Can edit');
    expect(whoSeesOf({ ...who, access: 'view', ownerName: null })).toBe(
      'Shared with you by its owner · Can view',
    );
    expect(whoSeesOf({ ...who, access: 'none' })).toBe('Shared with you by Sam');
  });

  it('marks damage as critical and a clean check as positive', () => {
    expect(integrityOf(item)?.tone).toBe('positive');
    expect(integrityOf(image(3, 'b.jpg'))?.text).toBe('Checked, no damage found');
    expect(integrityOf(folder(2, 'Quotes'))).toBeNull();
  });

  it('names who changed the current version and on which computer', () => {
    const names = (id: string): string | null => (id === LAPTOP ? 'Laptop' : null);
    expect(changedByOf(item, version(3, AT), NAMES, names)).toBe('Sam on Laptop');
    expect(changedByOf(item, version(3, AT, { deviceId: null }), NAMES, names)).toBe('Sam');
    expect(changedByOf(item, version(2, AT), NAMES, names)).toBeNull();
    expect(changedByOf(item, undefined, NAMES, names)).toBeNull();
    const outside = image(4, 'c.jpg', { outside: true });
    expect(changedByOf(outside, version(3, AT), NAMES, names)).toBe('outside SmartEverything');
  });
});

describe('edits per day', () => {
  const today = '2026-11-07';

  it('counts versions into one bar per day of the last 30 days', () => {
    const bars = editsPerDay(
      [
        version(3, '2026-11-07T12:00:00.000Z'),
        version(2, '2026-11-07T12:00:00.000Z'),
        version(1, '2026-11-01T12:00:00.000Z'),
      ],
      today,
    );
    expect(bars).toHaveLength(EDIT_DAYS);
    expect(bars.at(-1)).toEqual({ key: today, value: 2 });
    expect(bars.find((bar) => bar.key === '2026-11-01')?.value).toBe(1);
    expect(editsTotal(bars)).toBe(3);
  });

  it('asks for older versions only until the window is covered', () => {
    const start = editWindowStart(today);
    expect(needsOlderVersions([version(3, '2026-11-07T12:00:00.000Z')], start, true)).toBe(true);
    expect(needsOlderVersions([version(1, '2026-09-01T12:00:00.000Z')], start, true)).toBe(false);
    expect(needsOlderVersions([], start, false)).toBe(false);
  });
});

describe('quick row', () => {
  it('offers the file actions the person may use', () => {
    expect(quickActionsOf(image(1, 'a.jpg'), true)).toEqual([
      'preview',
      'star',
      'share',
      'chat',
      'trash',
    ]);
  });

  it('drops trash when read-only, and the file actions on folders', () => {
    expect(quickActionsOf(image(1, 'a.jpg'), false)).toEqual(['preview', 'star', 'share', 'chat']);
    expect(quickActionsOf(folder(2, 'Quotes'), true)).toEqual(['star', 'share', 'trash']);
  });
});

describe('preview body', () => {
  it('reads sheets by type or extension, text by type, and pictures from a ready thumbnail', () => {
    expect(previewBodyOf(document(1, 'Budget.csv', 'text/csv'))).toBe('sheet');
    expect(previewBodyOf(document(2, 'Rows.tsv', 'application/octet-stream'))).toBe('sheet');
    expect(previewBodyOf(document(3, 'Notes.md', 'text/markdown'))).toBe('text');
    expect(previewBodyOf(document(4, 'config.json', 'application/json'))).toBe('text');
    expect(previewBodyOf(document(5, 'Budget.xlsx', 'application/vnd.ms-excel'))).toBe('none');
    expect(previewBodyOf(image(6, 'Cat.jpg'))).toBe('picture');
    const pdf = DRIVE_ITEM.parse({
      ...document(7, 'Plan.pdf', 'application/pdf'),
      thumb: { state: 'ready' },
    });
    expect(previewBodyOf(pdf)).toBe('picture');
    expect(previewBodyOf(folder(8, 'Kitchen'))).toBe('none');
  });

  it('reads a head that fills the tallest pane: 90 lines of 90 characters', () => {
    expect(90 * 90).toBeLessThanOrEqual(PREVIEW_HEAD_BYTES);
    expect(headIsWhole(document(1, 'a.txt', 'text/plain', PREVIEW_HEAD_BYTES))).toBe(true);
    expect(headIsWhole(document(2, 'b.txt', 'text/plain', PREVIEW_HEAD_BYTES + 1))).toBe(false);
  });

  it('drops the cut last line of a partial head and the empty line after a final newline', () => {
    expect(headLinesOf('one\r\ntwo\nthr', false)).toEqual(['one', 'two']);
    expect(headLinesOf('one\ntwo\n', true)).toEqual(['one', 'two']);
    expect(headLinesOf('one\ntwo', true)).toEqual(['one', 'two']);
    expect(headLinesOf('', true)).toEqual([]);
  });

  it('splits sheet rows on the delimiter and keeps quoted delimiters and quotes', () => {
    expect(sheetDelimiterOf(document(1, 'a.tsv', 'text/tab-separated-values'))).toBe('\t');
    const sheet = sheetHeadOf(['Item,Jan,Feb', '"Power, gas",84', '"Say ""hi""",1,2,3'], ',');
    expect(sheet.columns).toBe(4);
    expect(sheet.rows).toEqual([
      ['Item', 'Jan', 'Feb'],
      ['Power, gas', '84'],
      ['Say "hi"', '1', '2', '3'],
    ]);
  });

  it('names columns as a spreadsheet does', () => {
    expect([0, 3, 25, 26, 27, 51, 52, 701, 702].map(columnNameOf)).toEqual([
      'A',
      'D',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });
});

describe('computer rings', () => {
  type Facts = Parameters<typeof placementRingOf>[0];

  function placement(
    id: string,
    state: Facts['status']['state'],
    extra: Partial<Facts> = {},
  ): Facts {
    return { id, mode: 'synced', hold: null, status: { state, needBytes: 0 }, ...extra };
  }

  it('gives each placement its share of the placed folder and a word from its state', () => {
    const rings = [
      placementRingOf(placement('a', 'up_to_date'), 'Workstation', 4096),
      placementRingOf(
        placement('b', 'syncing', { status: { state: 'syncing', needBytes: 2048 } }),
        'Laptop',
        4096,
      ),
      placementRingOf(placement('c', 'offline'), 'Office PC', 4096),
      placementRingOf(placement('d', 'failed'), 'Den', 4096),
      placementRingOf(placement('e', 'up_to_date', { hold: 'no_access' }), 'Attic', 4096),
      placementRingOf(placement('f', 'mounted', { mode: 'mounted' }), 'Studio', 4096),
      placementRingOf(placement('g', 'failed', { mode: 'mounted' }), 'Shed', 4096),
      placementRingOf(placement('h', 'stopped'), 'Spare', 4096),
    ];
    expect(rings.map((ring) => [ring.name, ring.share, ring.word, ring.tone])).toEqual([
      ['Workstation', 1, 'up to date', 'positive'],
      ['Laptop', 0.5, `${bytes(2048)} left`, 'info'],
      ['Office PC', 1, 'offline', null],
      ['Den', 1, 'sync failed', 'critical'],
      ['Attic', 1, 'on hold', 'warning'],
      ['Studio', 1, 'mounted', 'positive'],
      ['Shed', 1, 'mount failed', 'critical'],
      ['Spare', 1, 'paused', null],
    ]);
  });

  it('counts an item as placed when it is the placed folder or inside it, or the whole drive', () => {
    expect(coversItem(null, 'Home/a.jpg')).toBe(true);
    expect(coversItem('Home', 'Home/a.jpg')).toBe(true);
    expect(coversItem('Home', 'Home')).toBe(true);
    expect(coversItem('Home', 'Homework/a.jpg')).toBe(false);
  });
});
