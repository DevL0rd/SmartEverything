import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { NativeHubResourceRestore } from '@smarteverything/domain';
import { PhotoRestore } from '../../src/photos/restore';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const TAKEN = Date.parse('2024-06-01T10:20:30Z');

interface Fixture {
  readonly pictures: string;
  readonly videos: string;
  readonly restore: PhotoRestore;
  readonly download: (text: string) => Promise<string>;
}

async function fixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'desktop-photo-restore-'));
  roots.push(root);
  const pictures = join(root, 'Pictures');
  const videos = join(root, 'Videos');
  const staging = join(root, 'staging');
  await mkdir(pictures);
  await mkdir(videos);
  await mkdir(staging);
  let next = 0;
  return {
    pictures,
    videos,
    restore: new PhotoRestore(pictures, videos),
    download: async (text): Promise<string> => {
      next += 1;
      const path = join(staging, `${String(next)}.bin`);
      await writeFile(path, text);
      return path;
    },
  };
}

function request(patch: Partial<NativeHubResourceRestore>): NativeHubResourceRestore {
  return {
    id: 'a'.repeat(64),
    name: 'beach.jpg',
    mimeType: 'image/jpeg',
    sha256: null,
    takenAt: TAKEN,
    target: { kind: 'restored' },
    ...patch,
  };
}

describe('saving a photo back to this computer', () => {
  it('saves anything without an origin into Pictures/Restored with its taken time', async () => {
    const { pictures, restore, download } = await fixture();
    const result = await restore.place(await download('one'), request({ sha256: sha('one') }));
    expect(result).toEqual({ result: 'saved', location: join(pictures, 'Restored', 'beach.jpg') });
    expect(await readFile(result.location, 'utf8')).toBe('one');
    expect((await stat(result.location)).mtimeMs).toBe(TAKEN);
    expect(await readdir(join(pictures, 'Restored'))).toEqual(['beach.jpg']);
  });

  it('puts a photo from this computer back in its original folder, made again when gone', async () => {
    const { videos, restore, download } = await fixture();
    const folder = join(videos, 'Trip', 'Day 1');
    const result = await restore.place(
      await download('clip'),
      request({ name: 'clip.mp4', mimeType: 'video/mp4', target: { kind: 'origin', folder } }),
    );
    expect(result).toEqual({ result: 'saved', location: join(folder, 'clip.mp4') });
  });

  it('reports an identical file already there instead of writing a copy', async () => {
    const { pictures, restore, download } = await fixture();
    const folder = join(pictures, 'Camera');
    await mkdir(folder);
    await writeFile(join(folder, 'IMG_1.jpg'), 'same');
    const result = await restore.place(
      await download('same'),
      request({ target: { kind: 'origin', folder } }),
    );
    expect(result).toEqual({ result: 'present', location: join(folder, 'IMG_1.jpg') });
    expect(await readdir(folder)).toEqual(['IMG_1.jpg']);
  });

  it('keeps a different file of the same name and saves under the next free name', async () => {
    const { pictures, restore, download } = await fixture();
    const folder = join(pictures, 'Restored');
    await mkdir(folder);
    await writeFile(join(folder, 'beach.jpg'), 'other');
    const result = await restore.place(await download('mine'), request({}));
    expect(result.location).toBe(join(folder, 'beach (1).jpg'));
    expect((await readdir(folder)).sort()).toEqual(['beach (1).jpg', 'beach.jpg']);
  });

  it('refuses a changed download, a folder outside the photo folders and a path as a name', async () => {
    const { pictures, restore, download } = await fixture();
    await expect(restore.place(await download('x'), request({ sha256: sha('y') }))).rejects.toThrow(
      /arrived changed/,
    );
    await expect(
      restore.place(await download('x'), request({ target: { kind: 'origin', folder: '/etc' } })),
    ).rejects.toThrow(/outside/);
    await expect(restore.place(await download('x'), request({ name: '../x.jpg' }))).rejects.toThrow(
      /plain file name/,
    );
    expect(await readdir(pictures)).toEqual([]);
  });

  it('shows only locations inside the photo folders', async () => {
    const { pictures, restore } = await fixture();
    expect(restore.revealable(join(pictures, 'Restored', 'a.jpg'))).toBe(
      join(pictures, 'Restored', 'a.jpg'),
    );
    expect(() => restore.revealable('/etc/passwd')).toThrow(/Only restored/);
  });
});
