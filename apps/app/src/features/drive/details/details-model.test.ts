import { describe, expect, it } from 'vitest';
import {
  DRIVE_ITEM,
  DRIVE_ROOT,
  DRIVE_VERSION,
  type DriveItem,
  type DriveVersion,
} from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { FOLDER_ID, ROOT_ID, rootRow } from '../../nas/data/fixtures';
import type { ByName } from '../folder/folder-model';
import {
  DETAILS_TABS,
  EDIT_DAYS,
  PREVIEW_HEAD_BYTES,
  activeTabOf,
  changedByOf,
  columnNameOf,
  computerRingsOf,
  editWindowStart,
  editsPerDay,
  editsTotal,
  headIsWhole,
  headLinesOf,
  integrityOf,
  kindTextOf,
  needsOlderVersions,
  pathOf,
  presentationOf,
  previewBodyOf,
  quickActionsOf,
  readRememberedTab,
  rememberTab,
  sheetDelimiterOf,
  sheetHeadOf,
  slottedTabsOf,
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

const ALL_SLOTS = slottedTabsOf({ versions: 1, activity: 1, sharing: 1 });

describe('details tabs', () => {
  it('shows every tab for a file when every slot is filled', () => {
    expect(tabsOf(image(1, 'a.jpg'), ALL_SLOTS)).toEqual(DETAILS_TABS);
  });

  it('leaves out Preview and Versions for a folder', () => {
    expect(tabsOf(folder(2, 'Quotes'), ALL_SLOTS)).toEqual(['info', 'activity', 'sharing']);
  });

  it('leaves out the tabs whose slot no task has filled', () => {
    expect(tabsOf(image(1, 'a.jpg'), slottedTabsOf({}))).toEqual(['preview', 'info']);
    expect(slottedTabsOf({ activity: 1 })).toEqual(new Set(['activity']));
  });

  it('remembers the last tab and falls back to Info when it is missing', () => {
    rememberTab('versions');
    expect(readRememberedTab()).toBe('versions');
    expect(activeTabOf(readRememberedTab(), tabsOf(image(1, 'a.jpg'), ALL_SLOTS))).toBe('versions');
    expect(activeTabOf(readRememberedTab(), tabsOf(folder(2, 'Quotes'), ALL_SLOTS))).toBe('info');
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
  const root = rootRow(ROOT_ID, 'ready');
  const item = image(1, 'Island sketch v4.jpg');

  it('names the kind from the extension', () => {
    expect(kindTextOf(item)).toBe('JPG image');
    expect(kindTextOf(folder(2, 'Quotes'))).toBe('Folder');
  });

  it('writes where the item is and the hub path of its folder', () => {
    expect(whereOf(root, item)).toBe('Photos › Home › Kitchen');
    expect(pathOf(root, item)).toBe('/data/photos/Home/Kitchen/');
  });

  it('says who sees a home folder and a private one', () => {
    expect(whoSeesOf(root, ME, NAMES)).toBe('Everyone at home');
    const mine = DRIVE_ROOT.parse({ ...root, scope: 'person', ownerProfileId: ME });
    expect(whoSeesOf(mine, ME, NAMES)).toBe('Only you');
    expect(whoSeesOf(mine, SAM, NAMES)).toBe('Only Robin');
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
    expect(quickActionsOf(image(1, 'a.jpg'), { sharing: true, writable: true })).toEqual([
      'preview',
      'star',
      'share',
      'chat',
      'trash',
    ]);
  });

  it('drops share without a share slot, trash when read-only, and file actions on folders', () => {
    expect(quickActionsOf(image(1, 'a.jpg'), { sharing: false, writable: false })).toEqual([
      'preview',
      'star',
      'chat',
    ]);
    expect(quickActionsOf(folder(2, 'Quotes'), { sharing: true, writable: true })).toEqual([
      'star',
      'share',
      'trash',
    ]);
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
  it('gives each computer its share and a word from its sync state', () => {
    const rings = computerRingsOf(
      [
        { key: 'a', name: 'Workstation', tone: 'positive' },
        { key: 'b', name: 'Laptop', tone: 'info' },
        { key: 'c', name: 'Office PC', tone: null },
        { key: 'd', name: 'Den', tone: 'critical' },
        { key: 'e', name: 'Attic', tone: 'warning' },
      ],
      [
        { clientId: 'a', needBytes: 0 },
        { clientId: 'b', needBytes: 2048 },
        { clientId: 'c', needBytes: 512 },
      ],
      (needBytes) => 1 - needBytes / 4096,
    );
    expect(rings.map((ring) => [ring.name, ring.share, ring.word])).toEqual([
      ['Workstation', 1, 'up to date'],
      ['Laptop', 0.5, `${bytes(2048)} left`],
      ['Office PC', 0.875, 'offline'],
      ['Den', 1, 'sync failed'],
      ['Attic', 1, 'conflict'],
    ]);
  });
});
