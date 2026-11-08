import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { PhotoLibrary } from '../../src/photos/library';

const roots: string[] = [];
const libraries: PhotoLibrary[] = [];
afterEach(async () => {
  for (const library of libraries.splice(0)) library.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(): Promise<{ root: string; library: PhotoLibrary }> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-photo-test-'));
  roots.push(root);
  const library = new PhotoLibrary([root, root]);
  libraries.push(library);
  return { root, library };
}

describe('desktop local photos', () => {
  it('lists nested Pictures and Videos without backup, deduplicates roots and excludes symlinks', async () => {
    const { root, library } = await fixture();
    await mkdir(join(root, 'nested'));
    await writeFile(join(root, 'a.JPG'), 'image');
    await writeFile(join(root, 'nested', 'b.mp4'), 'video');
    await writeFile(join(root, 'notes.txt'), 'not media');
    await symlink(join(root, 'a.JPG'), join(root, 'linked.jpg'));
    const result = await library.list();
    expect(result.issues).toEqual([]);
    expect(result.items.map((item) => item.name).sort()).toEqual(['a.JPG', 'b.mp4']);
    expect(result.items.find((item) => item.name === 'b.mp4')?.video).toBe(true);
    expect(
      result.items.every((item) => item.uri.startsWith('app://smarteverything/local-media/')),
    ).toBe(true);
    expect(result.items.every((item) => !item.uri.includes(root))).toBe(true);
  });

  it('hashes admitted files with streaming SHA and rejects modified files', async () => {
    const { root, library } = await fixture();
    await writeFile(join(root, 'a.png'), 'original');
    const [item] = (await library.list()).items;
    if (item === undefined) throw new Error('Fixture item missing.');
    expect(await library.hash(item.id, 'upload')).toEqual({
      bytes: 8,
      sha256: createHash('sha256').update('original').digest('hex'),
    });
    await writeFile(join(root, 'a.png'), 'modified file');
    await expect(library.hash(item.id, 'upload-next')).rejects.toThrow('changed');
  });

  it('treats an absent standard Videos folder as empty while listing Pictures', async () => {
    const { root } = await fixture();
    const pictures = join(root, 'Pictures');
    await mkdir(pictures);
    await writeFile(join(pictures, 'a.jpg'), 'image');
    const library = new PhotoLibrary([pictures, join(root, 'Videos')]);
    libraries.push(library);
    const result = await library.list();
    expect(result.items.map((item) => item.name)).toEqual(['a.jpg']);
    expect(result.issues).toEqual([]);
  });

  it('returns an empty complete inventory when both standard folders are absent', async () => {
    const { root } = await fixture();
    const library = new PhotoLibrary([join(root, 'Pictures'), join(root, 'Videos')]);
    libraries.push(library);
    expect(await library.list()).toEqual({ items: [], issues: [] });
  });

  it('retains genuine directory read failures so incomplete inventories cannot be backed up', async () => {
    const { root } = await fixture();
    const pictures = join(root, 'Pictures');
    const videos = join(root, 'Videos');
    await mkdir(pictures);
    await writeFile(join(pictures, 'a.jpg'), 'image');
    await writeFile(videos, 'This path is a file, not a readable media directory.');
    const library = new PhotoLibrary([pictures, videos]);
    libraries.push(library);
    const result = await library.list();
    expect(result.items.map((item) => item.name)).toEqual(['a.jpg']);
    expect(result.issues).toEqual([
      { folder: videos, message: 'Could not read this media folder.' },
    ]);
  });

  it('aborts an in-flight hash when the runner cancels its operation', async () => {
    const { root, library } = await fixture();
    await writeFile(join(root, 'a.jpg'), 'image');
    const [item] = (await library.list()).items;
    if (item === undefined) throw new Error('Fixture item missing.');
    const pending = library.hash(item.id, 'cancel-me');
    library.cancel('cancel-me');
    await expect(pending).rejects.toThrow();
  });
});

describe('desktop media scan ownership', () => {
  it('coalesces parallel scans and discards a snapshot invalidated during enumeration', async () => {
    const { root } = await fixture();
    await writeFile(join(root, 'current.jpg'), 'image');
    const source = new PhotoLibrary([root]);
    libraries.push(source);
    const current = await source.list();
    const currentId = current.items[0]?.id;
    if (currentId === undefined) throw new Error('Fixture item missing.');
    const currentFile = await source.file(currentId);
    let finish:
      | ((value: { files: readonly (typeof currentFile)[]; issues: readonly [] }) => void)
      | undefined;
    const delayed = new Promise<{ files: readonly (typeof currentFile)[]; issues: readonly [] }>(
      (resolve) => {
        finish = resolve;
      },
    );
    let scans = 0;
    const library = new PhotoLibrary([root], async () => {
      scans += 1;
      return scans === 1 ? delayed : { files: [currentFile], issues: [] };
    });
    libraries.push(library);
    const first = library.list();
    const parallel = library.list();
    expect(first).toBe(parallel);
    library.invalidate();
    if (finish === undefined) throw new Error('Delayed scan missing.');
    finish({ files: [], issues: [] });
    const result = await first;
    expect(scans).toBe(2);
    expect(result.items).toEqual(current.items);
    expect(await library.file(currentId)).toEqual(currentFile);
    expect(await parallel).toEqual(result);
  });
});
