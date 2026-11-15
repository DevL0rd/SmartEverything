import { describe, expect, it } from 'vitest';
import { NO_MARKS } from '../source/node';
import { entryTextOf, exportStateOf, lockedNoteOf } from './export-model';

const FILE = { kind: 'document', exportable: true, entry: null } as const;
const ENTRY = { line: 'Points to Docs/plan.md', stays: 'It stays on the drive.' };

describe('exportStateOf', () => {
  it('lets a person download and select a file they may export', () => {
    expect(exportStateOf(FILE, { download: true })).toEqual({
      entry: null,
      viewOnly: false,
      mayOpen: true,
      mayDownload: true,
      selectable: true,
    });
  });

  it('refuses downloads and selection of a view only file', () => {
    expect(exportStateOf({ ...FILE, exportable: false }, { download: true })).toEqual({
      entry: null,
      viewOnly: true,
      mayOpen: false,
      mayDownload: false,
      selectable: false,
    });
  });

  it('tells an entry that holds no content apart from a view only file', () => {
    const entry = { kind: 'link', exportable: false, entry: ENTRY } as const;
    expect(exportStateOf(entry, { download: true })).toEqual({
      entry: ENTRY,
      viewOnly: false,
      mayOpen: false,
      mayDownload: false,
      selectable: false,
    });
    expect(entryTextOf(ENTRY)).toBe('Points to Docs/plan.md\nIt stays on the drive.');
  });

  it('offers no download where the source cannot download or for a folder', () => {
    expect(exportStateOf(FILE, { download: false }).mayDownload).toBe(false);
    expect(exportStateOf({ ...FILE, kind: 'folder' }, { download: true }).mayDownload).toBe(false);
  });
});

describe('lockedNoteOf', () => {
  it('tells people who still export that viewers are held back', () => {
    const locked = { ...NO_MARKS, locked: true };
    expect(lockedNoteOf({ exportable: true, marks: locked })).toMatch(
      /view access cannot download/,
    );
    expect(lockedNoteOf({ exportable: false, marks: locked })).toBeNull();
    expect(lockedNoteOf({ exportable: true, marks: NO_MARKS })).toBeNull();
  });
});
