import { randomUUID } from 'node:crypto';
import { ApiError, type DriveItem } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FS_MKDIR, FS_REMOVE, type DriveFsApi, type FsCaller } from '../../src/drive/fs-api';
import type { StoredDrive } from '../../src/store/repositories/drive-roots';
import type { TestStore } from '../support/store';
import { openFsRig, type FsRig } from './fs-rig';

let rig: FsRig;
let opened: TestStore;
let ownerId = '';
let node = '';
let api: DriveFsApi;

function owner(): FsCaller {
  return rig.owner();
}

function seedFolder(root: StoredDrive, relPath: string): Promise<DriveItem> {
  return rig.seedFolder(root, relPath);
}

function seedFile(root: StoredDrive, relPath: string, text: string): Promise<DriveItem> {
  return rig.seedFile(root, relPath, text);
}

async function refusal(run: () => unknown): Promise<ApiError> {
  try {
    await run();
  } catch (cause) {
    if (cause instanceof ApiError) return cause;
    throw cause;
  }
  throw new Error('expected a refusal');
}

beforeEach(async () => {
  rig = await openFsRig();
  ({ opened, ownerId, api } = rig);
  node = rig.ownerNode;
});

afterEach(async () => {
  await opened.close();
});

let opCount = 0;

function op(): string {
  opCount += 1;
  return `op-${String(opCount)}`;
}

describe('op ids', () => {
  it('answers a repeated mkdir with the first answer and applies it once', async () => {
    const root = rig.shared;
    const input = { opId: op(), parentId: null, name: 'new' };
    const first = await api.mkdir(owner(), root.id, input);
    const second = await api.mkdir(owner(), root.id, input);
    expect(second).toEqual(first);
    expect(
      opened.store.driveItems.children({
        rootId: root.id,
        parentId: null,
        after: null,
        limit: 10,
        viewer: ownerId,
      }).entries,
    ).toHaveLength(1);
    expect((await refusal(() => api.mkdir(owner(), root.id, { ...input, opId: op() }))).code).toBe(
      'conflict',
    );
  });

  it('answers a repeated rename without moving twice', async () => {
    const root = rig.shared;
    const file = await seedFile(root, 'a.txt', 'hello');
    const input = { opId: op(), itemId: file.id, parentId: null, name: 'b.txt' };
    const first = await api.rename(owner(), root.id, input);
    const second = await api.rename(owner(), root.id, input);
    expect(second).toEqual(first);
    expect(second.name).toBe('b.txt');
    expect(opened.store.driveItems.byId(file.id, null).rev).toBe(first.rev);
  });

  it('answers a repeated unlink and rmdir that already took effect', async () => {
    const root = rig.shared;
    const file = await seedFile(root, 'a.txt', 'hello');
    const folder = await seedFolder(root, 'sub');
    const unlink = { opId: op(), itemId: file.id };
    const rmdir = { opId: op(), itemId: folder.id };
    await api.unlink(owner(), root.id, unlink);
    await api.rmdir(owner(), root.id, rmdir);
    await expect(api.unlink(owner(), root.id, unlink)).resolves.toBeUndefined();
    await expect(api.rmdir(owner(), root.id, rmdir)).resolves.toBeUndefined();
    expect(
      (await refusal(() => api.unlink(owner(), root.id, { ...unlink, opId: op() }))).code,
    ).toBe('not_found');
  });

  it('answers a repeated utimens with the first answer', async () => {
    const root = rig.shared;
    const file = await seedFile(root, 'a.txt', 'hello');
    const input = { opId: op(), itemId: file.id, modifiedAt: '2026-01-02T03:04:05.000Z' };
    const first = await api.utimens(owner(), root.id, input);
    const second = await api.utimens(owner(), root.id, input);
    expect(second).toEqual(first);
    expect(second.modifiedAt).toBe('2026-01-02T03:04:05.000Z');
  });

  it('refuses an op id reused for another operation', async () => {
    const root = rig.shared;
    const id = op();
    await api.mkdir(owner(), root.id, { opId: id, parentId: null, name: 'x' });
    const folder = opened.store.driveItems.byPath(root.id, 'x', null);
    const itemId = folder?.id ?? '';
    expect((await refusal(() => api.rmdir(owner(), root.id, { opId: id, itemId }))).code).toBe(
      'conflict',
    );
  });

  it('applies simultaneous duplicates once', async () => {
    const root = rig.shared;
    const input = { opId: op(), parentId: null, name: 'once' };
    const [first, second] = await Promise.all([
      api.mkdir(owner(), root.id, input),
      api.mkdir(owner(), root.id, input),
    ]);
    expect(second).toEqual(first);
  });

  it('does not remember a refused operation', async () => {
    const root = rig.shared;
    const input = { opId: op(), parentId: null, name: 'late' };
    await seedFolder(root, 'late');
    expect((await refusal(() => api.mkdir(owner(), root.id, input))).code).toBe('conflict');
    expect(opened.store.driveSyncOps.recall(node, input.opId)).toBeUndefined();
  });

  it('requires an op id on every mutation', () => {
    expect(FS_MKDIR.safeParse({ base: undefined, parentId: null, name: 'x' }).success).toBe(false);
    expect(FS_REMOVE.safeParse({ itemId: randomUUID() }).success).toBe(false);
  });
});

describe('subtree roots', () => {
  async function mounted(): Promise<{ root: StoredDrive; base: DriveItem; inner: DriveItem }> {
    const root = rig.shared;
    await seedFolder(root, 'roms');
    const base = await seedFolder(root, 'roms/snes');
    await seedFile(root, 'roms/snes/mario.sfc', 'rom');
    await seedFile(root, 'other.txt', 'no');
    const inner = await seedFolder(root, 'roms/snes/hacks');
    rig.mount(node, ownerId, root, base.id);
    return { root, base, inner };
  }

  it('lists from the subtree folder as if it were the root', async () => {
    const { root, base, inner } = await mounted();
    const top = api.list(owner(), root.id, { base: base.id });
    expect(top.folder).toBeNull();
    expect(top.entries.map((entry) => [entry.name, entry.parentId])).toEqual([
      ['hacks', null],
      ['mario.sfc', null],
    ]);
    const deeper = api.list(owner(), root.id, { base: base.id, folder: inner.id });
    expect(deeper.folder?.parentId).toBeNull();
    expect(deeper.folder?.id).toBe(inner.id);
    const again = api.list(owner(), root.id, { base: base.id, folder: base.id });
    expect(again.folder).toBeNull();
  });

  it('refuses items outside the subtree', async () => {
    const { root, base } = await mounted();
    const outside = opened.store.driveItems.byPath(root.id, 'other.txt', null);
    const parent = opened.store.driveItems.byPath(root.id, 'roms', null);
    const ids = [outside?.id ?? '', parent?.id ?? '', base.id];
    for (const folder of ids.slice(0, 2)) {
      expect(
        (await refusal(() => api.list(owner(), root.id, { base: base.id, folder }))).code,
      ).toBe('not_found');
    }
    for (const itemId of ids) {
      const rename = { opId: op(), base: base.id, itemId, parentId: null, name: 'z' };
      expect((await refusal(() => api.rename(owner(), root.id, rename))).code).toBe('not_found');
      expect((await refusal(() => api.readable(owner(), root.id, itemId, base.id))).code).toBe(
        'not_found',
      );
    }
  });

  it('refuses a base that is not a folder of this library folder', async () => {
    const { root } = await mounted();
    const file = opened.store.driveItems.byPath(root.id, 'roms/snes/mario.sfc', null);
    const other = rig.mine;
    const foreign = await seedFolder(other, 'x');
    for (const base of [file?.id ?? '', foreign.id]) {
      expect((await refusal(() => api.list(owner(), root.id, { base }))).code).toBe('not_found');
    }
  });

  it('stats a path relative to the subtree', async () => {
    const { root, base } = await mounted();
    expect(api.stat(owner(), root.id, { base: base.id, path: 'mario.sfc' })?.name).toBe(
      'mario.sfc',
    );
    expect(api.stat(owner(), root.id, { base: base.id, path: '' })).toBeNull();
    expect(
      (await refusal(() => api.stat(owner(), root.id, { base: base.id, path: 'other.txt' }))).code,
    ).toBe('not_found');
    expect(
      (await refusal(() => api.stat(owner(), root.id, { base: base.id, path: '../other.txt' })))
        .code,
    ).toBe('invalid_request');
  });

  it('writes under the subtree folder with a null parent', async () => {
    const { root, base } = await mounted();
    const made = await api.mkdir(owner(), root.id, {
      opId: op(),
      base: base.id,
      parentId: null,
      name: 'fresh',
    });
    expect(made.parentId).toBeNull();
    expect(opened.store.driveItems.byId(made.id, null).relPath).toBe('roms/snes/fresh');
    const file = opened.store.driveItems.byPath(root.id, 'roms/snes/mario.sfc', null);
    const moved = await api.rename(owner(), root.id, {
      opId: op(),
      base: base.id,
      itemId: file?.id ?? '',
      parentId: made.id,
      name: 'mario.sfc',
    });
    expect(moved.parentId).toBe(made.id);
    expect(opened.store.driveItems.byId(moved.id, null).relPath).toBe('roms/snes/fresh/mario.sfc');
  });

  it('refuses a move out of the subtree', async () => {
    const { root, base } = await mounted();
    const outside = opened.store.driveItems.byPath(root.id, 'roms', null);
    const file = opened.store.driveItems.byPath(root.id, 'roms/snes/mario.sfc', null);
    const rename = {
      opId: op(),
      base: base.id,
      itemId: file?.id ?? '',
      parentId: outside?.id ?? '',
      name: 'mario.sfc',
    };
    expect((await refusal(() => api.rename(owner(), root.id, rename))).code).toBe('not_found');
  });
});
