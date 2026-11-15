import { mkdtemp, mkdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DirtyTracker,
  pairRenames,
  type DirtyBatch,
  type EntryIdentity,
  type HeldDelete,
} from '../../src/drive-sync/dirty.js';
import { statProbe } from '../../src/drive-sync/watch.js';

const LINK: EntryIdentity = { kind: 'link', bytes: 0, mtimeNs: 5n };

describe('pairing a symlink rename', () => {
  it('pairs a removed link with a created link of the same identity', () => {
    const held = new Map<string, HeldDelete>([['old', { identity: LINK, since: 0 }]]);
    expect(pairRenames(new Map([['new', LINK]]), held)).toEqual([
      { from: 'old', to: 'new', kind: 'link' },
    ]);
  });

  it('does not pair a link with a file of the same size and time', () => {
    const held = new Map<string, HeldDelete>([['old', { identity: LINK, since: 0 }]]);
    const file: EntryIdentity = { kind: 'file', bytes: 0, mtimeNs: 5n };
    expect(pairRenames(new Map([['new', file]]), held)).toEqual([]);
  });

  it('does not pair entries of kind other', () => {
    const other: EntryIdentity = { kind: 'other', bytes: 0, mtimeNs: 5n };
    const held = new Map<string, HeldDelete>([['old', { identity: other, since: 0 }]]);
    expect(pairRenames(new Map([['new', other]]), held)).toEqual([]);
  });
});

describe('the tracker with symlinks', () => {
  it('reports a symlink moved to a new name as one rename', async () => {
    const disk = new Map<string, EntryIdentity>([['old', LINK]]);
    const known = new Map<string, EntryIdentity>([['old', LINK]]);
    const batches: DirtyBatch[] = [];
    const tracker = new DirtyTracker(
      {
        probe: (path): Promise<EntryIdentity | undefined> => Promise.resolve(disk.get(path)),
        known: (path): EntryIdentity | undefined => known.get(path),
        isIgnored: (): boolean => false,
      },
      {
        batch: (batch): void => {
          batches.push(batch);
        },
        rescan: (): void => undefined,
        failure: (): void => undefined,
      },
      { changeQuietMs: 5, deleteHoldMs: 1000, queueLimit: null },
    );
    disk.delete('old');
    disk.set('new', LINK);
    tracker.mark('old');
    tracker.mark('new');
    await new Promise((resolve) => setTimeout(resolve, 60));
    tracker.close();
    expect(batches).toEqual([
      { renames: [{ from: 'old', to: 'new', kind: 'link' }], changed: [], deleted: [] },
    ]);
  });
});

describe('probing a symlink on disk', () => {
  let scratch = '';

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'drive-sync-dirty-'));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('reports a symlink as a link, even when it dangles, and keeps it through a rename', async () => {
    await mkdir(join(scratch, 'sub'));
    await symlink('/nonexistent/target', join(scratch, 'sub', 'dangling'));
    await writeFile(join(scratch, 'plain'), 'x');
    const probe = statProbe(scratch);
    const before = await probe('sub/dangling');
    expect(before).toMatchObject({ kind: 'link', bytes: 0 });
    expect(await probe('plain')).toMatchObject({ kind: 'file' });
    await rename(join(scratch, 'sub', 'dangling'), join(scratch, 'sub', 'renamed'));
    expect(await probe('sub/dangling')).toBeUndefined();
    expect(await probe('sub/renamed')).toEqual(before);
  });
});
