import { describe, expect, it, vi } from 'vitest';
import { DRIVE_ITEM, type DriveItem } from '@smarteverything/domain';
import { FOLDER_ID, ROOT_ID } from '../data/fixtures';
import {
  SWIPE_STEP,
  UNCHANGED_CONTEXT,
  changeSummary,
  clampSplit,
  compareKindOf,
  diffTexts,
  gutterDigits,
  imageModesFor,
  imageSizeOf,
  readVersionText,
  segmentsOf,
  signedCount,
  swipeCaption,
  unchangedText,
  zoomPercent,
  type DiffSegment,
  type FetchText,
} from './diff-model';

const AT = '2026-11-07T10:00:00.000Z';

function base(name: string): object {
  return {
    id: 'd1b2c3d4-0000-4000-8000-000000000001',
    rootId: ROOT_ID,
    parentId: FOLDER_ID,
    relPath: `Notes/${name}`,
    name,
    modifiedAt: AT,
    addedAt: AT,
    openedAt: null,
    starred: false,
    shared: false,
    rev: 3,
    etag: 'etag',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    sha256: null,
    integrity: 'unknown',
  };
}

function document(name: string, mime: string): DriveItem {
  return DRIVE_ITEM.parse({
    ...base(name),
    kind: 'document',
    mime,
    bytes: 2048,
    thumb: { state: 'none' },
  });
}

function image(name: string, mime: string): DriveItem {
  return DRIVE_ITEM.parse({
    ...base(name),
    kind: 'image',
    mime,
    bytes: 4096,
    takenAt: null,
    width: null,
    height: null,
    orientation: null,
    camera: null,
    exposure: null,
    place: null,
    thumb: { state: 'ready' },
  });
}

function numbered(count: number, prefix = 'line'): string {
  return Array.from({ length: count }, (_, index) => `${prefix} ${String(index + 1)}`).join('\n');
}

function shape(segments: readonly DiffSegment[]): readonly string[] {
  return segments.map((segment) =>
    segment.kind === 'unchanged'
      ? `skip ${String(segment.count)}`
      : `lines ${String(segment.lines.length)}`,
  );
}

describe('compare kinds', () => {
  it('compares images as pictures, text and markdown as a line diff and the rest by download', () => {
    expect(compareKindOf(image('Island.jpg', 'image/jpeg'))).toBe('image');
    expect(compareKindOf(document('Notes.md', 'text/markdown'))).toBe('text');
    expect(compareKindOf(document('todo.txt', 'text/plain'))).toBe('text');
    expect(compareKindOf(document('Plan.pdf', 'application/pdf'))).toBe('download');
  });

  it('opens on side by side with a pointer and on swipe on touch', () => {
    expect(imageModesFor(true)).toEqual(['side', 'swipe']);
    expect(imageModesFor(false)).toEqual(['swipe', 'side']);
  });

  it('reads the original of a shown image and the preview of one the app cannot draw', () => {
    expect(imageSizeOf(image('Island.jpg', 'image/jpeg'))).toBe('file');
    expect(imageSizeOf(image('Island.heic', 'image/heic'))).toBe('preview');
  });
});

describe('image compare', () => {
  it('keeps the swipe line inside the picture', () => {
    expect(clampSplit(-0.2)).toBe(0);
    expect(clampSplit(0.5 + SWIPE_STEP)).toBeCloseTo(0.6);
    expect(clampSplit(1.4)).toBe(1);
  });

  it('shows the shared zoom as a whole percent', () => {
    expect(zoomPercent(1)).toBe(100);
    expect(zoomPercent(1.5625)).toBe(156);
  });

  it('explains what moves together in each mode', () => {
    expect(swipeCaption('side')).toBe('Zoom and pan move both sides together.');
    expect(swipeCaption('swipe')).toContain('Drag the line');
  });
});

describe('line diff', () => {
  it('counts added and removed lines from B to A and numbers both sides', async () => {
    const diff = await diffTexts('a\nb\nc\n', 'a\nB\nc\nd\n');
    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(1);
    expect(diff.lines).toEqual([
      { kind: 'context', text: 'a', oldLine: 1, newLine: 1 },
      { kind: 'remove', text: 'b', oldLine: 2, newLine: null },
      { kind: 'add', text: 'B', oldLine: null, newLine: 2 },
      { kind: 'context', text: 'c', oldLine: 3, newLine: 3 },
      { kind: 'add', text: 'd', oldLine: null, newLine: 4 },
    ]);
    expect(changeSummary(diff)).toBe('lines between B and A');
    expect(signedCount('+', diff.added)).toBe('+2');
    expect(signedCount('−', diff.removed)).toBe('−1');
  });

  it('says when the two versions have the same lines', async () => {
    const diff = await diffTexts('same\n', 'same\n');
    expect(diff.added + diff.removed).toBe(0);
    expect(changeSummary(diff)).toBe('No line changes between B and A');
  });

  it('sizes the line number gutter for the widest number on either side', async () => {
    const diff = await diffTexts(numbered(9), `${numbered(9)}\nline 10`);
    expect(gutterDigits(diff.lines)).toBe(2);
    expect(gutterDigits([])).toBe(1);
  });
});

describe('unchanged runs', () => {
  it('collapses unchanged runs to the context around each change', async () => {
    const before = numbered(40);
    const after = before.replace('line 20', 'line twenty');
    const diff = await diffTexts(before, after);
    const segments = segmentsOf(diff.lines, false);
    expect(shape(segments)).toEqual([
      `skip ${String(19 - UNCHANGED_CONTEXT)}`,
      `lines ${String(2 + UNCHANGED_CONTEXT * 2)}`,
      `skip ${String(20 - UNCHANGED_CONTEXT)}`,
    ]);
    expect(segments.map((segment) => segment.key)).toEqual(['0', '16', '24']);
  });

  it('joins two changes whose context touches into one block', async () => {
    const before = numbered(20);
    const after = before.replace('line 5', 'five').replace('line 10', 'ten');
    const segments = segmentsOf((await diffTexts(before, after)).lines, false);
    expect(shape(segments)).toEqual(['skip 1', 'lines 14', 'skip 7']);
  });

  it('keeps short unchanged runs at the edges inside the block', async () => {
    const diff = await diffTexts('a\nb\n', 'a\nc\n');
    expect(shape(segmentsOf(diff.lines, false))).toEqual(['lines 3']);
  });

  it('shows every line when unchanged lines are on and one run when nothing changed', async () => {
    const changed = await diffTexts(numbered(30), numbered(30).replace('line 1\n', 'one\n'));
    expect(shape(segmentsOf(changed.lines, true))).toEqual([
      `lines ${String(changed.lines.length)}`,
    ]);
    const same = await diffTexts(numbered(12), numbered(12));
    expect(shape(segmentsOf(same.lines, false))).toEqual(['skip 12']);
    expect(segmentsOf([], false)).toEqual([]);
    expect(segmentsOf([], true)).toEqual([]);
  });

  it('names the hidden run in words', () => {
    expect(unchangedText(1)).toBe('1 unchanged line');
    expect(unchangedText(1200)).toBe('1,200 unchanged lines');
  });
});

describe('ranged reads', () => {
  it('reads the whole version with one range and decodes it as text', async () => {
    const fetchText = vi.fn<FetchText>(() =>
      Promise.resolve(new Response(new TextEncoder().encode('héllo\n'), { status: 206 })),
    );
    await expect(readVersionText('https://hub/v', 7, fetchText)).resolves.toBe('héllo\n');
    expect(fetchText).toHaveBeenCalledWith('https://hub/v', {
      headers: { Range: 'bytes=0-6' },
    });
  });

  it('reads nothing for an empty version and fails when the hub refuses', async () => {
    const fetchText = vi.fn<FetchText>(() => Promise.resolve(new Response(null, { status: 404 })));
    await expect(readVersionText('https://hub/v', 0, fetchText)).resolves.toBe('');
    expect(fetchText).not.toHaveBeenCalled();
    await expect(readVersionText('https://hub/v', 4, fetchText)).rejects.toThrow('404');
  });
});
