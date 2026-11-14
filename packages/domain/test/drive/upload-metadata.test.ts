import { describe, expect, it } from 'vitest';
import { DRIVE_UPLOAD_METADATA } from '../../src/drive/upload';

const FOLDER = {
  filename: 'photo.jpg',
  targetKind: 'folder',
  folderId: '2b048af8-0518-4e6e-a981-d6beeb7d792f',
} as const;
const TOP = {
  filename: 'photo.jpg',
  targetKind: 'drive',
  rootId: '2b048af8-0518-4e6e-a981-d6beeb7d792f',
} as const;
const ITEM = {
  filename: 'photo.jpg',
  targetKind: 'item',
  itemId: FOLDER.folderId,
  baseRev: '2',
} as const;

describe('the canonical app and hub upload metadata', () => {
  it('accepts a folder or revision-checked item with optional media type and expected hash', () => {
    for (const target of [TOP, FOLDER, ITEM]) {
      expect(DRIVE_UPLOAD_METADATA.parse(target)).toEqual(target);
      const complete = { ...target, filetype: 'image/jpeg', sha256: 'a'.repeat(64) };
      expect(DRIVE_UPLOAD_METADATA.parse(complete)).toEqual(complete);
    }
  });

  it('rejects the old server-only shape, unknown fields and mixed upload targets', () => {
    expect(
      DRIVE_UPLOAD_METADATA.safeParse({ name: 'photo.jpg', folderId: FOLDER.folderId }).success,
    ).toBe(false);
    expect(DRIVE_UPLOAD_METADATA.safeParse({ ...FOLDER, extra: true }).success).toBe(false);
    expect(DRIVE_UPLOAD_METADATA.safeParse({ ...FOLDER, itemId: FOLDER.folderId }).success).toBe(
      false,
    );
    expect(DRIVE_UPLOAD_METADATA.safeParse({ ...TOP, folderId: TOP.rootId }).success).toBe(false);
  });

  it.each(['', '.', '..', 'folder/photo.jpg', 'photo\0.jpg'])(
    'rejects a filename outside one named path segment: %s',
    (filename) => {
      expect(DRIVE_UPLOAD_METADATA.safeParse({ ...FOLDER, filename }).success).toBe(false);
    },
  );

  it.each(['0', '-1', '1.5', ''])(
    'rejects a nonpositive or noninteger base revision: %s',
    (baseRev) => {
      expect(DRIVE_UPLOAD_METADATA.safeParse({ ...ITEM, baseRev }).success).toBe(false);
    },
  );

  it('rejects a malformed or uppercase content hash and an empty supplied media type', () => {
    expect(DRIVE_UPLOAD_METADATA.safeParse({ ...FOLDER, sha256: 'wrong' }).success).toBe(false);
    expect(DRIVE_UPLOAD_METADATA.safeParse({ ...FOLDER, sha256: 'A'.repeat(64) }).success).toBe(
      false,
    );
    expect(DRIVE_UPLOAD_METADATA.safeParse({ ...FOLDER, filetype: '' }).success).toBe(false);
  });
});
