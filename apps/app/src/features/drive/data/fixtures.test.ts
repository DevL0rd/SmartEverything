import { describe, expect, it } from 'vitest';
import {
  FOLDER_ID,
  ROOT_ID,
  audioFixture,
  documentFixture,
  driveItemFixture,
  folderFixture,
  imageFixture,
  otherFixture,
  videoFixture,
} from './fixtures';

describe('drive item fixtures', () => {
  it('build a valid item of every kind with the new fields at their neutral values', () => {
    const kinds = ['folder', 'image', 'video', 'audio', 'document', 'other'] as const;
    for (const kind of kinds) {
      const item = driveItemFixture(kind);
      expect(item.kind).toBe(kind);
      expect(item.rootId).toBe(ROOT_ID);
      expect(item.parentId).toBe(FOLDER_ID);
      expect(item.locked).toBe(false);
      expect(item.openComments).toBe(0);
      expect(item.openedAt).toBeNull();
    }
    const folder = folderFixture();
    expect(folder.colour).toBeNull();
    expect(folder.iconHint).toBe(false);
  });

  it('apply a patch over the defaults and keep the name and path in step', () => {
    const item = documentFixture({ name: 'Taxes.pdf', locked: true, openComments: 3 });
    expect(item.name).toBe('Taxes.pdf');
    expect(item.relPath).toBe('Taxes.pdf');
    expect(item.locked).toBe(true);
    expect(item.openComments).toBe(3);
    expect(folderFixture({ colour: 'viz-3', iconHint: true })).toMatchObject({
      colour: 'viz-3',
      iconHint: true,
    });
  });

  it('narrow to the kind asked for', () => {
    expect(imageFixture().kind).toBe('image');
    expect(videoFixture().durationMs).toBeNull();
    expect(audioFixture().kind).toBe('audio');
    expect(otherFixture().kind).toBe('other');
  });

  it('refuse a patch the contract does not allow', () => {
    expect(() => driveItemFixture('document', { colour: 'viz-1' })).toThrow();
    expect(() => folderFixture({ colour: 'red' })).toThrow();
  });
});
