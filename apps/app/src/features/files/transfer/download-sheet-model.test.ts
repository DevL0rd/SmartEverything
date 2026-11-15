import { describe, expect, it } from 'vitest';
import { bytes } from '../../../format/number';
import { nodeOfEntry } from '../source/fixture-tree';
import type { DownloadPlanView, PreparedDownload } from '../source/types';
import type { DownloadState } from './download-flow';
import { downloadSheetOf, factsOf, intentsOf } from './download-sheet-model';

const notes = nodeOfEntry({ key: '/h/notes.txt', parentKey: '/h', name: 'notes.txt' });
const photos = nodeOfEntry({ key: '/h/Photos', parentKey: '/h', name: 'Photos', kind: 'folder' });

function prepared(change: Partial<DownloadPlanView> = {}): PreparedDownload {
  const download: DownloadPlanView = {
    kind: 'zip',
    name: 'Photos.zip',
    size: null,
    files: 12,
    folders: 2,
    bytes: 3_000_000,
    skipped: [],
    url: 'u',
    expiresAt: '2026-11-14T11:00:00.000Z',
    ...change,
  };
  return { download, url: 'u' };
}

describe('download sheet', () => {
  it('is closed while idle and names what is being prepared', () => {
    expect(downloadSheetOf({ kind: 'idle' }, false)).toEqual({ kind: 'closed' });
    expect(downloadSheetOf({ kind: 'preparing', targets: [notes] }, false)).toEqual({
      kind: 'preparing',
      line: 'Getting notes.txt ready…',
    });
    expect(downloadSheetOf({ kind: 'preparing', targets: [notes, photos] }, false)).toEqual({
      kind: 'preparing',
      line: 'Getting 2 items ready…',
    });
  });

  it('keeps the targets of a failure for retry', () => {
    const error = new Error('gone');
    expect(downloadSheetOf({ kind: 'failed', targets: [photos], error }, true)).toEqual({
      kind: 'failed',
      error,
      targets: [photos],
    });
  });

  it('lists every skipped item with its reason', () => {
    const skipped = [
      { path: 'Photos/raw.cr2', reason: 'Not allowed to be downloaded' },
      { path: 'Photos/a.lnk', reason: 'Links are not followed' },
      { path: 'Photos/b', reason: 'Not readable' },
      { path: 'Photos/c', reason: 'Not readable' },
      { path: 'Photos/d', reason: 'Not readable' },
      { path: 'Photos/e', reason: 'Not readable' },
    ];
    const state: DownloadState = {
      kind: 'ready',
      targets: [photos],
      prepared: prepared({ skipped }),
    };
    const view = downloadSheetOf(state, false);
    expect(view).toMatchObject({
      kind: 'ready',
      name: 'Photos.zip',
      facts: `Zip of 12 files, 2 folders · ${bytes(3_000_000)}`,
      skippedTitle: '6 items can’t be included',
      working: null,
      done: null,
      busy: false,
    });
    expect(view.kind === 'ready' ? view.skipped : []).toHaveLength(6);
    expect(view.kind === 'ready' ? view.skipped[0] : null).toBe(
      'Photos/raw.cr2 — Not allowed to be downloaded',
    );
  });

  it('shows working and done lines for the chosen intent', () => {
    const ready = prepared({ kind: 'file', name: 'notes.txt', size: 2_000, files: 1, folders: 0 });
    expect(
      downloadSheetOf({ kind: 'working', targets: [notes], prepared: ready, intent: 'save' }, true),
    ).toMatchObject({ working: `Saving ${bytes(2_000)}`, busy: true, skippedTitle: null });
    expect(
      downloadSheetOf(
        { kind: 'done', targets: [notes], prepared: ready, intent: 'save', outcome: 'completed' },
        true,
      ),
    ).toMatchObject({ done: 'Saved to this phone.', busy: false });
    expect(
      downloadSheetOf(
        { kind: 'done', targets: [notes], prepared: ready, intent: 'save', outcome: 'external' },
        false,
      ),
    ).toMatchObject({ done: 'The download started in your browser.' });
  });

  it('offers save, open and share on a phone and one download elsewhere', () => {
    expect(intentsOf(true).map((spec) => spec.intent)).toEqual(['save', 'open', 'share']);
    expect(intentsOf(false)).toEqual([
      { intent: 'save', label: 'Download', icon: 'download', primary: true },
    ]);
  });

  it('words a zip without folders', () => {
    expect(factsOf(prepared({ folders: 0, files: 1, bytes: 1_000 }).download)).toBe(
      `Zip of 1 file · ${bytes(1_000)}`,
    );
  });
});
