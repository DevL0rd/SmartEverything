import { describe, expect, it } from 'vitest';
import type { DriveItem } from '@smarteverything/domain';
import { documentFixture, driveItemFixture, folderFixture, imageFixture } from '../data/fixtures';
import {
  ENTRY_ICON,
  entryKindOf,
  entryLineOf,
  isContentItem,
  isEntryItem,
  thumbReadyOf,
  type EntryItem,
} from './item-content';

function entry(kind: EntryItem['kind'], patch: Readonly<Record<string, unknown>> = {}): EntryItem {
  const item = driveItemFixture(kind, patch);
  if (!isEntryItem(item)) throw new TypeError('the fixture is not a link or special file');
  return item;
}

const LINK = entry('link', {
  id: 'a1b2c3d4-0000-4000-8000-000000000301',
  name: 'latest',
  linkTarget: 'releases/2026-11/notes.md',
});

const FIFO = entry('special', { id: 'a1b2c3d4-0000-4000-8000-000000000302', name: 'queue' });

const DOC = documentFixture({ id: 'a1b2c3d4-0000-4000-8000-000000000303', name: 'Plan.pdf' });

const PHOTO = imageFixture({
  id: 'a1b2c3d4-0000-4000-8000-000000000304',
  name: 'Beach.jpg',
  thumb: { state: 'ready' },
});

describe('links and special files in Drive', () => {
  it('tells content files apart from folders, links and special files', () => {
    const items: readonly DriveItem[] = [folderFixture(), LINK, FIFO, DOC, PHOTO];
    expect(items.map(isContentItem)).toEqual([false, false, false, true, true]);
    expect(items.map(isEntryItem)).toEqual([false, true, true, false, false]);
    expect(items.map(entryKindOf)).toEqual(['folder', 'link', 'other', 'file', 'file']);
  });

  it('gives each a kind icon and a line saying what it is', () => {
    expect(ENTRY_ICON).toEqual({ link: 'link', special: 'cpu' });
    expect(entryLineOf(LINK)).toBe('Points to releases/2026-11/notes.md');
    expect(entryLineOf(FIFO)).toBe('Pipe, socket or device entry');
  });

  it('never waits for a thumbnail of them', () => {
    expect([thumbReadyOf(LINK), thumbReadyOf(FIFO), thumbReadyOf(PHOTO)]).toEqual([
      false,
      false,
      true,
    ]);
  });
});
