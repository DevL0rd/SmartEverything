import { describe, expect, it, vi } from 'vitest';
import { DRIVE_ITEM, type DriveItem } from '@smarteverything/domain';
import type { KeyPress } from '../../../design/keyboard';
import { FOLDER_ID, ROOT_ID } from '../../nas/data/fixtures';
import { readRememberedTab, rememberTab } from '../details/details-model';
import {
  contentOf,
  detailsOnInfo,
  isTextMime,
  kindLabelOf,
  placeOf,
  positionText,
  quickLookKeyFor,
  stepOf,
} from './quick-look-model';

const AT = '2026-11-07T10:00:00.000Z';

function idOf(index: number): string {
  return `c1b2c3d4-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function base(index: number, name: string): object {
  return {
    id: idOf(index),
    rootId: ROOT_ID,
    parentId: FOLDER_ID,
    relPath: `Pictures/${name}`,
    name,
    modifiedAt: AT,
    addedAt: AT,
    openedAt: null,
    starred: false,
    rev: 1,
    etag: 'etag',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
  };
}

const MEDIA = {
  takenAt: null,
  width: null,
  height: null,
  orientation: null,
  camera: null,
  exposure: null,
  place: null,
};

type Thumb = 'none' | 'ready';

interface FileSpec {
  readonly kind: 'document' | 'other' | 'audio';
  readonly mime: string;
  readonly thumb?: Thumb;
}

function file(index: number, name: string, spec: FileSpec): DriveItem {
  return DRIVE_ITEM.parse({
    ...base(index, name),
    kind: spec.kind,
    mime: spec.mime,
    bytes: 2048,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: spec.thumb ?? 'none' },
    ...(spec.kind === 'audio' ? { takenAt: null, durationMs: null } : {}),
  });
}

function image(index: number, name: string, mime: string, thumb: Thumb): DriveItem {
  return DRIVE_ITEM.parse({
    ...base(index, name),
    ...MEDIA,
    kind: 'image',
    mime,
    bytes: 4096,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: thumb },
  });
}

function video(index: number, name: string): DriveItem {
  return DRIVE_ITEM.parse({
    ...base(index, name),
    ...MEDIA,
    kind: 'video',
    durationMs: 72_000,
    mime: 'video/mp4',
    bytes: 8192,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'ready' },
  });
}

function folder(index: number, name: string): DriveItem {
  return DRIVE_ITEM.parse({ ...base(index, name), kind: 'folder', childCount: 4, bytes: 10 });
}

function press(key: string, change: Partial<KeyPress> = {}): KeyPress {
  return { key, command: false, alt: false, shift: false, typing: false, ...change };
}

const ALPHA = folder(1, 'Alpha');
const PHOTO = image(2, 'IMG_2041.jpg', 'image/jpeg', 'ready');
const ZETA = folder(3, 'Zeta');
const CLIP = video(4, 'Fireworks.mp4');
const NOTES = file(5, 'notes.md', { kind: 'document', mime: 'text/markdown' });
const ITEMS = [ALPHA, PHOTO, ZETA, CLIP, NOTES];

describe('quick look stepping', () => {
  it('steps between files and skips folders', () => {
    expect(stepOf(ITEMS, PHOTO, 'next')).toBe(CLIP);
    expect(stepOf(ITEMS, CLIP, 'previous')).toBe(PHOTO);
    expect(stepOf(ITEMS, CLIP, 'next')).toBe(NOTES);
  });

  it('stops at both ends of the folder', () => {
    expect(stepOf(ITEMS, PHOTO, 'previous')).toBeNull();
    expect(stepOf(ITEMS, NOTES, 'next')).toBeNull();
  });

  it('steps from a folder to the files around it', () => {
    expect(stepOf(ITEMS, ZETA, 'previous')).toBe(PHOTO);
    expect(stepOf(ITEMS, ZETA, 'next')).toBe(CLIP);
    expect(stepOf(ITEMS, ALPHA, 'previous')).toBeNull();
  });

  it('counts the position among files only', () => {
    const place = placeOf(ITEMS, CLIP);
    expect(place.position).toBe(2);
    expect(place.total).toBe(3);
    expect(positionText(place)).toBe('2 of 3');
    expect(placeOf(ITEMS, ZETA).position).toBeNull();
  });

  it('shows no position for a single file or an item that left the folder', () => {
    expect(positionText(placeOf([ALPHA, PHOTO], PHOTO))).toBeNull();
    const gone = placeOf([PHOTO, NOTES], CLIP);
    expect(gone).toEqual({ position: null, total: 2, previous: null, next: null });
    expect(stepOf([PHOTO, NOTES], CLIP, 'next')).toBeNull();
  });
});

describe('quick look keys', () => {
  it('maps the arrows and Space', () => {
    expect(quickLookKeyFor(press('ArrowLeft'))).toBe('previous');
    expect(quickLookKeyFor(press('ArrowRight'))).toBe('next');
    expect(quickLookKeyFor(press(' '))).toBe('close');
  });

  it('leaves the folder keys, chords and typing alone', () => {
    expect(quickLookKeyFor(press('ArrowDown'))).toBeNull();
    expect(quickLookKeyFor(press('Enter'))).toBeNull();
    expect(quickLookKeyFor(press('ArrowRight', { shift: true }))).toBeNull();
    expect(quickLookKeyFor(press('ArrowLeft', { command: true }))).toBeNull();
    expect(quickLookKeyFor(press('ArrowLeft', { alt: true }))).toBeNull();
    expect(quickLookKeyFor(press(' ', { typing: true }))).toBeNull();
  });
});

describe('quick look content', () => {
  it('picks the view for each kind of item', () => {
    expect(contentOf(ALPHA)).toBe('folder');
    expect(contentOf(PHOTO)).toBe('image');
    expect(contentOf(CLIP)).toBe('video');
    expect(contentOf(file(6, 'song.flac', { kind: 'audio', mime: 'audio/flac' }))).toBe('audio');
    expect(contentOf(NOTES)).toBe('text');
  });

  it('shows images the app can draw even before a preview exists', () => {
    expect(contentOf(image(7, 'new.png', 'image/png', 'none'))).toBe('image');
    expect(contentOf(image(8, 'DSC_0812.ARW', 'image/x-sony-arw', 'ready'))).toBe('image');
    expect(contentOf(image(9, 'DSC_0813.ARW', 'image/x-sony-arw', 'none'))).toBe('none');
  });

  it('shows a document preview picture when there is one', () => {
    expect(
      contentOf(
        file(10, 'Boiler.pdf', { kind: 'document', mime: 'application/pdf', thumb: 'ready' }),
      ),
    ).toBe('picture');
    expect(contentOf(file(11, 'Boiler.pdf', { kind: 'document', mime: 'application/pdf' }))).toBe(
      'none',
    );
  });

  it('reads text kinds from the mime type', () => {
    expect(isTextMime('text/plain; charset=utf-8')).toBe(true);
    expect(isTextMime('application/json')).toBe(true);
    expect(isTextMime('application/ld+json')).toBe(true);
    expect(isTextMime('image/svg+xml')).toBe(true);
    expect(isTextMime('application/pdf')).toBe(false);
    expect(isTextMime('application/octet-stream')).toBe(false);
  });

  it('labels the kind from the file extension', () => {
    expect(
      kindLabelOf(
        file(12, 'Boiler service 2026.pdf', { kind: 'document', mime: 'application/pdf' }),
      ),
    ).toBe('PDF');
    expect(
      kindLabelOf(file(13, 'README', { kind: 'other', mime: 'application/octet-stream' })),
    ).toBe('File');
    expect(kindLabelOf(file(14, 'README', { kind: 'document', mime: 'text/plain' }))).toBe(
      'Document',
    );
    expect(kindLabelOf(ALPHA)).toBe('Folder');
  });
});

describe('quick look details', () => {
  it('opens the details pane on Info for the shown item', () => {
    rememberTab('versions');
    const details = vi.fn<(item: DriveItem) => void>();
    const open = detailsOnInfo(details, CLIP);
    open?.();
    expect(readRememberedTab()).toBe('info');
    expect(details).toHaveBeenCalledWith(CLIP);
  });

  it('offers no Details when the folder has no details pane', () => {
    expect(detailsOnInfo(null, CLIP)).toBeNull();
  });
});
