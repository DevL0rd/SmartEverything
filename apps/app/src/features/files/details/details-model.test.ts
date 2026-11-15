import { describe, expect, it } from 'vitest';
import { bytes } from '../../../format/number';
import { NO_ABILITIES, abilitiesOf, offlineOf, readOnlyOf } from '../source/abilities';
import { COMPUTER_FULL } from '../source/fixture-seeds';
import { nodeOfEntry, type FixtureEntry, type FixtureNode } from '../source/fixture-tree';
import {
  PREVIEW_HEAD_BYTES,
  activeTabOf,
  columnNameOf,
  headLinesOf,
  kindTextOf,
  presentationOf,
  previewBodyOf,
  previewableOf,
  quickActionsOf,
  sheetDelimiterOf,
  sheetHeadOf,
  sizeTextOf,
  subjectOf,
  tabsOf,
} from './details-model';

function node(key: string, name: string, over: Partial<FixtureEntry> = {}): FixtureNode {
  return nodeOfEntry({ key, parentKey: 'root', name, ...over });
}

const PHOTO = node('photo', 'Cat.jpg', { mime: 'image/jpeg', size: 2048 });
const FOLDER = node('kitchen', 'Kitchen', { kind: 'folder' });
const DRIVE_TABS = [
  { id: 'comments', label: 'Comments' },
  { id: 'versions', label: 'Versions' },
  { id: 'activity', label: 'Activity' },
  { id: 'sharing', label: 'Sharing' },
];
const DRIVE = abilitiesOf(['details', 'star', 'attach', 'download', 'trash'], {
  quickLook: ['image', 'video', 'audio', 'document', 'archive', 'other'],
});

function keysOf(tabs: readonly { readonly key: string }[]): readonly string[] {
  return tabs.map((tab) => tab.key);
}

describe('tab set per abilities', () => {
  it('shows Preview and Info for a file, then the source tabs in their order', () => {
    expect(keysOf(tabsOf(PHOTO, DRIVE, DRIVE_TABS))).toEqual([
      'preview',
      'info',
      'comments',
      'versions',
      'activity',
      'sharing',
    ]);
    expect(tabsOf(PHOTO, COMPUTER_FULL, []).map((tab) => tab.label)).toEqual(['Preview', 'Info']);
  });

  it('leaves out Preview for a folder and for a kind the source cannot look at', () => {
    expect(keysOf(tabsOf(FOLDER, COMPUTER_FULL, []))).toEqual(['info']);
    expect(keysOf(tabsOf(node('bin', 'data.bin'), COMPUTER_FULL, []))).toEqual(['info']);
    expect(keysOf(tabsOf(PHOTO, offlineOf(COMPUTER_FULL), []))).toEqual(['info']);
  });

  it('shows no tabs where the source has no details, and never doubles a built-in tab', () => {
    expect(tabsOf(PHOTO, NO_ABILITIES, DRIVE_TABS)).toEqual([]);
    const doubled = [{ id: 'info', label: 'Other info' }, ...DRIVE_TABS.slice(0, 1)];
    expect(keysOf(tabsOf(PHOTO, DRIVE, doubled))).toEqual(['preview', 'info', 'comments']);
  });

  it('keeps the remembered tab while the node has it and falls back to Info', () => {
    expect(activeTabOf('versions', tabsOf(PHOTO, DRIVE, DRIVE_TABS))).toBe('versions');
    expect(activeTabOf('versions', tabsOf(PHOTO, COMPUTER_FULL, []))).toBe('info');
    expect(activeTabOf('preview', tabsOf(FOLDER, DRIVE, DRIVE_TABS))).toBe('info');
  });
});

describe('selection follow', () => {
  const a = node('a', 'a.jpg');
  const b = node('b', 'b.jpg');

  it('follows the focused row first, then the last picked one', () => {
    expect(subjectOf({ focused: b, picked: [a, b], folder: FOLDER })).toBe(b);
    expect(subjectOf({ focused: null, picked: [b, a], folder: FOLDER })).toBe(a);
  });

  it('shows the open folder when nothing is picked, and nothing at the top of a place', () => {
    expect(subjectOf({ focused: null, picked: [], folder: FOLDER })).toBe(FOLDER);
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

describe('kind text', () => {
  it('names the kind from the extension', () => {
    expect(kindTextOf(PHOTO)).toBe('JPG image');
    expect(kindTextOf(node('r', 'README', { kind: 'document' }))).toBe('Document');
    expect(kindTextOf(node('z', 'Trip.zip'))).toBe('ZIP archive');
    expect(kindTextOf(FOLDER)).toBe('Folder');
    expect(kindTextOf(node('q', 'queue.txt', { kind: 'special' }))).toBe('Special file');
    expect(sizeTextOf(PHOTO)).toBe(`JPG image · ${bytes(2048)}`);
    expect(sizeTextOf(FOLDER)).toBe('Folder');
  });

  it('shows a preview picture only for images and videos with a thumbnail', () => {
    expect(previewableOf(PHOTO, 'thumb://cat')).toBe(true);
    expect(previewableOf(PHOTO, null)).toBe(false);
    expect(previewableOf(node('p', 'Plan.pdf'), 'thumb://plan')).toBe(false);
  });
});

describe('quick row', () => {
  it('offers the file actions the source and the node allow', () => {
    expect(quickActionsOf(PHOTO, DRIVE)).toEqual(['preview', 'star', 'chat', 'download', 'trash']);
    expect(quickActionsOf(PHOTO, COMPUTER_FULL)).toEqual(['preview', 'chat', 'download', 'trash']);
  });

  it('drops trash where nothing may change and the file actions on folders', () => {
    expect(quickActionsOf(PHOTO, readOnlyOf(COMPUTER_FULL))).toEqual([
      'preview',
      'chat',
      'download',
    ]);
    expect(quickActionsOf(node('ro', 'a.jpg', { writable: false }), DRIVE)).toEqual([
      'preview',
      'star',
      'chat',
      'download',
    ]);
    expect(quickActionsOf(FOLDER, DRIVE)).toEqual(['star', 'trash']);
  });

  it('keeps a view only file out of chats and downloads', () => {
    expect(quickActionsOf(node('v', 'a.jpg', { exportable: false }), DRIVE)).toEqual([
      'preview',
      'star',
      'trash',
    ]);
  });
});

describe('preview body', () => {
  it('reads sheets by type or extension, text by type or name, and pictures from a thumbnail', () => {
    expect(previewBodyOf(node('1', 'Budget.csv', { mime: 'text/csv' }), null)).toBe('sheet');
    const rows = node('2', 'Rows.tsv', { mime: 'application/octet-stream' });
    expect(previewBodyOf(rows, null)).toBe('sheet');
    expect(previewBodyOf(node('3', 'Notes.md', { mime: 'text/markdown' }), null)).toBe('text');
    expect(previewBodyOf(node('4', 'config.json', { mime: 'application/json' }), null)).toBe(
      'text',
    );
    expect(previewBodyOf(node('5', 'app.log'), null)).toBe('text');
    const xlsx = node('6', 'Budget.xlsx', { mime: 'application/vnd.ms-excel' });
    expect(previewBodyOf(xlsx, null)).toBe('none');
    expect(previewBodyOf(PHOTO, 'thumb://cat')).toBe('picture');
    expect(previewBodyOf(node('7', 'Plan.pdf'), 'thumb://plan')).toBe('picture');
    expect(previewBodyOf(FOLDER, 'thumb://kitchen')).toBe('none');
  });

  it('reads a head that fills the tallest pane: 90 lines of 90 characters', () => {
    expect(90 * 90).toBeLessThanOrEqual(PREVIEW_HEAD_BYTES);
  });

  it('drops the cut last line of a partial head and the empty line after a final newline', () => {
    expect(headLinesOf('one\r\ntwo\nthr', false)).toEqual(['one', 'two']);
    expect(headLinesOf('one\ntwo\n', true)).toEqual(['one', 'two']);
    expect(headLinesOf('one\ntwo', true)).toEqual(['one', 'two']);
    expect(headLinesOf('', true)).toEqual([]);
  });

  it('splits sheet rows on the delimiter and keeps quoted delimiters and quotes', () => {
    expect(sheetDelimiterOf(node('t', 'a.tsv', { mime: 'text/tab-separated-values' }))).toBe('\t');
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
