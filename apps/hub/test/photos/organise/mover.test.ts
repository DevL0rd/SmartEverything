import { randomUUID } from 'node:crypto';
import type { DriveChange, DriveChangeResult } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { folderDraft } from '../../../src/drive/changes';
import type { DriveWriteService } from '../../../src/drive/service-write';
import type { DriveCaller } from '../../../src/drive/service-write-support';
import { LockedMover } from '../../../src/photos/organise/locked-move';
import { openKit, NOW, type Kit } from './fixture';

let kit: Kit;
let calls: DriveChange[];
let callers: DriveCaller[];
let conflicting: boolean;
let mover: LockedMover;

const EMPTY = { done: [], failed: [], conflicts: [] } as const;

function caller(profileId: string): DriveCaller {
  return { profileId, owner: true, via: 'app', deviceId: null };
}

function movedTo(folderId: string, itemIds: readonly string[]): DriveChangeResult {
  const folder = kit.store.driveItems.byId(folderId, null);
  for (const itemId of itemIds) {
    const item = kit.store.driveItems.byId(itemId, null);
    kit.store.context.sql.run(
      'move the fake item',
      'update drive_items set rel_path = $relPath where id = $id',
      { id: itemId, relPath: `${folder.relPath}/${item.name}` },
    );
  }
  return { ...EMPTY, done: itemIds.map((itemId) => ({ itemId, resultItemId: itemId })) };
}

function change(request: DriveChange): DriveChangeResult {
  calls.push(request);
  if (request.action === 'new_folder') {
    const id = randomUUID();
    const rootId = request.parent.kind === 'drive' ? request.parent.rootId : kit.aliceRoot;
    kit.store.driveItems.write({
      item: folderDraft(
        {
          id,
          rootId,
          parentId: null,
          relPath: request.name,
          modifiedAt: NOW,
          addedAt: NOW,
          outside: false,
          addedByProfileId: null,
        },
        0,
      ),
      identity: { dev: '9', ino: String(calls.length) },
    });
    return { ...EMPTY, done: [{ itemId: rootId, resultItemId: id }] };
  }
  if (request.action === 'trash' || request.action === 'delete_now') {
    return { ...EMPTY, done: request.itemIds.map((itemId) => ({ itemId, resultItemId: null })) };
  }
  if (request.action !== 'move') return EMPTY;
  if (conflicting) {
    return {
      ...EMPTY,
      conflicts: [
        { itemId: request.itemIds[0] ?? null, name: 'a.jpg', existingItemId: randomUUID() },
      ],
    };
  }
  return movedTo(request.toFolderId, request.itemIds);
}

const write: Pick<DriveWriteService, 'change'> = {
  change: (by, request) => {
    callers.push(by);
    return Promise.resolve(change(request));
  },
};

beforeEach(async () => {
  kit = await openKit();
  calls = [];
  callers = [];
  conflicting = false;
  mover = new LockedMover({ store: kit.store, write, now: (): Date => new Date(NOW) });
});
afterEach(async () => {
  await kit.test.close();
});

function share(itemId: string): string {
  return kit.store.driveShares.insert({
    id: randomUUID(),
    itemId,
    tokenHash: randomUUID().replaceAll('-', ''),
    permission: 'view',
    expiresAt: null,
    passwordHash: null,
    createdBy: kit.alice.profileId,
    createdAt: NOW,
  }).id;
}

describe('moving photos into the Locked folder', () => {
  it('makes the hidden folder once, moves into it, ends the links and announces the months', async () => {
    const first = kit.seed({
      n: 1,
      takenAt: '2026-03-01T10:00:00.000Z',
      root: kit.aliceRoot,
      name: 'Photos/a.jpg',
    });
    const second = kit.seed({
      n: 2,
      takenAt: '2026-04-01T10:00:00.000Z',
      root: kit.aliceRoot,
      name: 'Photos/b.jpg',
    });
    const link = share(first);
    await expect(mover.moveIn(caller(kit.alice.profileId), { itemIds: [first] })).resolves.toEqual({
      count: 1,
    });
    expect(calls.map((request) => request.action)).toEqual(['new_folder', 'move']);
    expect(calls[0]).toMatchObject({
      parent: { kind: 'drive', rootId: kit.aliceRoot },
      name: '.locked',
    });
    expect(kit.row(first)['rel_path']).toBe('.locked/a.jpg');
    expect(kit.store.driveShares.byId(link).revokedAt).toBe(NOW);
    expect(kit.notices).toMatchObject([{ type: 'drive_changed', months: ['2026-03'] }]);
    await mover.moveIn(caller(kit.alice.profileId), { itemIds: [second] });
    expect(calls.map((request) => request.action)).toEqual(['new_folder', 'move', 'move']);
  });

  it('refuses photos outside the caller own drive and changes nothing', async () => {
    const shared = kit.seed({ n: 1, takenAt: '2026-03-01T10:00:00.000Z', name: 'Photos/a.jpg' });
    await expect(
      mover.moveIn(caller(kit.alice.profileId), { itemIds: [shared] }),
    ).rejects.toMatchObject({
      code: 'invalid_request',
    });
    expect(calls).toEqual([]);
  });

  it('names a clash with a file already in the Locked folder', async () => {
    const id = kit.seed({
      n: 1,
      takenAt: '2026-03-01T10:00:00.000Z',
      root: kit.aliceRoot,
      name: 'Photos/a.jpg',
    });
    const link = share(id);
    conflicting = true;
    await expect(mover.moveIn(caller(kit.alice.profileId), { itemIds: [id] })).rejects.toThrow(
      'A file named a.jpg is already in the destination folder.',
    );
    expect(kit.store.driveShares.byId(link).revokedAt).toBeNull();
  });

  it('has no personal drive to move into for a caller without one', async () => {
    await expect(
      mover.moveIn(caller(randomUUID()), { itemIds: [randomUUID()] }),
    ).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('moving photos out of the Locked folder', () => {
  it('moves them to the Photos folder, making it when missing', async () => {
    const id = kit.seed({
      n: 1,
      takenAt: '2026-03-01T10:00:00.000Z',
      root: kit.aliceRoot,
      name: '.locked/a.jpg',
    });
    await expect(mover.moveOut(caller(kit.alice.profileId), { itemIds: [id] })).resolves.toEqual({
      count: 1,
    });
    expect(calls[0]).toMatchObject({ action: 'new_folder', name: 'Photos' });
    expect(kit.row(id)['rel_path']).toBe('Photos/a.jpg');
    expect(kit.notices).toMatchObject([{ type: 'drive_changed', months: ['2026-03'] }]);
    expect(callers.at(-1)?.lockedFolder).toBe('open');
  });

  it('refuses photos that are not in the caller Locked folder', async () => {
    const open = kit.seed({
      n: 1,
      takenAt: '2026-03-01T10:00:00.000Z',
      root: kit.aliceRoot,
      name: 'Photos/a.jpg',
    });
    const theirs = kit.seed({
      n: 2,
      takenAt: '2026-03-01T10:00:00.000Z',
      root: kit.bobRoot,
      name: '.locked/b.jpg',
    });
    for (const itemId of [open, theirs]) {
      await expect(
        mover.moveOut(caller(kit.alice.profileId), { itemIds: [itemId] }),
      ).rejects.toMatchObject({
        code: 'not_found',
      });
    }
    expect(calls).toEqual([]);
  });

  it('names a clash with a file already in Photos', async () => {
    const id = kit.seed({
      n: 1,
      takenAt: '2026-03-01T10:00:00.000Z',
      root: kit.aliceRoot,
      name: '.locked/a.jpg',
    });
    conflicting = true;
    await expect(mover.moveOut(caller(kit.alice.profileId), { itemIds: [id] })).rejects.toThrow(
      'A file named a.jpg is already in the destination folder.',
    );
  });
});

describe('deleting photos in the Locked folder', () => {
  it('trashes and removes them at once as an unlocked caller, so no trash ever lists them', async () => {
    const id = kit.seed({
      n: 1,
      takenAt: '2026-03-01T10:00:00.000Z',
      root: kit.aliceRoot,
      name: '.locked/a.jpg',
    });
    await expect(mover.remove(caller(kit.alice.profileId), { itemIds: [id] })).resolves.toEqual({
      count: 1,
    });
    expect(calls).toEqual([
      { action: 'trash', itemIds: [id] },
      { action: 'delete_now', itemIds: [id] },
    ]);
    expect(callers.map((by) => by.lockedFolder)).toEqual(['open', 'open']);
    expect(kit.notices).toMatchObject([{ type: 'drive_changed', months: ['2026-03'] }]);
  });

  it('refuses photos that are not in the caller Locked folder and deletes nothing', async () => {
    const open = kit.seed({
      n: 1,
      takenAt: '2026-03-01T10:00:00.000Z',
      root: kit.aliceRoot,
      name: 'Photos/a.jpg',
    });
    const theirs = kit.seed({
      n: 2,
      takenAt: '2026-03-01T10:00:00.000Z',
      root: kit.bobRoot,
      name: '.locked/b.jpg',
    });
    for (const itemId of [open, theirs]) {
      await expect(
        mover.remove(caller(kit.alice.profileId), { itemIds: [itemId] }),
      ).rejects.toMatchObject({ code: 'not_found' });
    }
    expect(calls).toEqual([]);
  });
});
