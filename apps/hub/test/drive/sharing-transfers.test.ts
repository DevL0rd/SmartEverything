import { lstat, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { DriveItem } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { itemAccess } from '../../src/drive/access';
import { DrivePlacements } from '../../src/drive/placements';
import { DriveShares, type ShareOrigin } from '../../src/drive/shares';
import { commitTrash } from '../../src/drive/trash-purge';
import { DriveTransfers } from '../../src/drive/sharing/transfers';
import { DriveQuotaExceededError } from '../../src/drive/quotas';
import { captureLogs } from '../support/logs';
import { openFsRig, type FsRig } from './fs-rig';
import { newId } from './placement-fixture';

let rig: FsRig;
let transfers: DriveTransfers;
let placements: DrivePlacements;
let kimId = '';
let trip: DriveItem;
let note: DriveItem;
let deep: DriveItem;
let sub: DriveItem;

function owner(): { profileId: string } {
  return { profileId: rig.ownerId };
}

function member(): { profileId: string } {
  return { profileId: rig.memberId };
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

async function refused(work: () => unknown): Promise<unknown> {
  try {
    await work();
  } catch (cause) {
    return cause;
  }
  throw new Error('The work was not refused.');
}

function accessTo(profileId: string, itemId: string): ReturnType<typeof itemAccess> {
  const { store } = rig.opened;
  const item = store.driveItems.byId(itemId, profileId);
  return itemAccess(store, { profileId }, store.driveRoots.byId(item.rootId), item);
}

function offer(itemId = trip.id): string {
  return transfers.offer(owner(), { itemId, toProfileId: rig.memberId }).id;
}

beforeEach(async () => {
  captureLogs();
  rig = await openFsRig();
  const { store } = rig.opened;
  kimId = store.profiles.create({ name: 'Kim' }).id;
  trip = await rig.seedFolder(rig.mine, 'Trip');
  sub = await rig.seedFolder(rig.mine, 'Trip/Day one');
  note = await rig.seedFile(rig.mine, 'Trip/note.txt', 'first words');
  note = await rig.seedFile(rig.mine, 'Trip/note.txt', 'second words, longer');
  deep = await rig.seedFile(rig.mine, 'Trip/Day one/map.txt', 'a map');
  placements = new DrivePlacements({ store, context: store.context, newId });
  transfers = new DriveTransfers({
    env: rig.changeEnv(),
    store,
    space: (): Promise<{ totalBytes: number; freeBytes: number }> =>
      Promise.resolve({ totalBytes: 10 ** 12, freeBytes: 10 ** 12 }),
    placements,
  });
});

afterEach(async () => {
  await rig.opened.close();
});

describe('offering a transfer', () => {
  it('offers an item of the caller own drive and tells the recipient', () => {
    const id = offer();
    expect(rig.opened.store.driveTransfers.byId(id)).toMatchObject({
      state: 'offered',
      itemId: trip.id,
      itemName: 'Trip',
      fromProfileId: rig.ownerId,
      toProfileId: rig.memberId,
    });
    expect(
      rig.opened.store.driveNotifications.list(rig.memberId, null, 5).notifications[0],
    ).toMatchObject({ kind: 'transfer_offered', itemId: trip.id, refId: id });
  });

  it('refuses to offer what is not the caller own, to oneself, to nobody and twice', async () => {
    const other = await rig.seedFile(rig.theirs, 'theirs.txt', 'x');
    expect(
      await refused(() => transfers.offer(owner(), { itemId: other.id, toProfileId: kimId })),
    ).toMatchObject({ code: 'not_found' });
    const shared = await rig.seedFile(rig.shared, 'shared.txt', 'x');
    expect(
      await refused(() => transfers.offer(owner(), { itemId: shared.id, toProfileId: kimId })),
    ).toMatchObject({ code: 'forbidden' });
    expect(
      await refused(() => transfers.offer(owner(), { itemId: trip.id, toProfileId: rig.ownerId })),
    ).toMatchObject({ code: 'invalid_request' });
    expect(
      await refused(() =>
        transfers.offer(owner(), {
          itemId: trip.id,
          toProfileId: '0f000000-0000-4000-8000-0000000000ff',
        }),
      ),
    ).toMatchObject({ code: 'not_found' });
    offer();
    expect(await refused(() => offer())).toMatchObject({ code: 'conflict' });
    rig.opened.store.driveGrants.set(
      { itemId: trip.id, profileId: rig.memberId, role: 'edit', expiresAt: null },
      rig.ownerId,
    );
    expect(
      await refused(() => transfers.offer(member(), { itemId: trip.id, toProfileId: kimId })),
    ).toMatchObject({ code: 'forbidden' });
  });

  it('lists the transfers a person sent and was offered', () => {
    const id = offer();
    expect(transfers.list(owner(), undefined).items.map((row) => row.id)).toEqual([id]);
    expect(transfers.list(member(), undefined).items.map((row) => row.id)).toEqual([id]);
    expect(transfers.list({ profileId: kimId }, undefined).items).toEqual([]);
  });
});

describe('declining and cancelling', () => {
  it('lets the recipient decline, tells the sender and moves nothing', async () => {
    const id = offer();
    const declined = await transfers.answer(member(), id, { accept: false });
    expect(declined.state).toBe('declined');
    expect(
      rig.opened.store.driveNotifications.list(rig.ownerId, null, 5).notifications[0],
    ).toMatchObject({
      kind: 'transfer_answered',
      refId: id,
      actorProfileId: rig.memberId,
    });
    expect(rig.opened.store.driveItems.byId(trip.id, rig.ownerId).rootId).toBe(rig.mine.id);
    expect(offer()).toBeTypeOf('string');
  });

  it('lets only the sender cancel and only the recipient answer, once', async () => {
    const id = offer();
    expect(await refused(() => transfers.cancel(member(), id))).toMatchObject({
      code: 'not_found',
    });
    expect(await refused(() => transfers.answer(owner(), id, { accept: true }))).toMatchObject({
      code: 'not_found',
    });
    expect(transfers.cancel(owner(), id).state).toBe('cancelled');
    expect(await refused(() => transfers.answer(member(), id, { accept: true }))).toMatchObject({
      code: 'conflict',
    });
    expect(await refused(() => transfers.cancel(owner(), id))).toMatchObject({ code: 'conflict' });
  });
});

describe('accepting a transfer', () => {
  it('moves the folder with everything in it into the top of the recipient drive and keeps the ids', async () => {
    const id = offer();
    const accepted = await transfers.answer(member(), id, { accept: true });
    expect(accepted.state).toBe('accepted');
    const { store } = rig.opened;
    for (const item of [trip, sub, note, deep]) {
      expect(store.driveItems.byId(item.id, rig.memberId).rootId).toBe(rig.theirs.id);
    }
    expect(store.driveItems.byId(trip.id, rig.memberId)).toMatchObject({
      relPath: 'Trip',
      parentId: null,
    });
    expect(store.driveItems.byId(deep.id, rig.memberId)).toMatchObject({
      relPath: 'Trip/Day one/map.txt',
      parentId: sub.id,
    });
    expect(await readFile(join(rig.theirs.path, 'Trip', 'note.txt'), 'utf8')).toBe(
      'second words, longer',
    );
    expect(await readFile(join(rig.theirs.path, 'Trip', 'Day one', 'map.txt'), 'utf8')).toBe(
      'a map',
    );
    expect(await exists(join(rig.mine.path, 'Trip'))).toBe(false);
    expect(store.driveItems.byPath(rig.mine.id, 'Trip', null)).toBeUndefined();
    expect(store.driveNotifications.list(rig.ownerId, null, 5).notifications[0]).toMatchObject({
      kind: 'transfer_answered',
      refId: id,
    });
  });

  it('gives the previous owner an edit grant and the recipient the ownership', async () => {
    await transfers.answer(member(), offer(), { accept: true });
    expect(accessTo(rig.memberId, trip.id)).toBe('own');
    expect(accessTo(rig.ownerId, trip.id)).toBe('edit');
    expect(accessTo(rig.ownerId, deep.id)).toBe('edit');
    expect(rig.opened.store.driveGrants.forPerson(trip.id, rig.ownerId)).toMatchObject({
      role: 'edit',
      grantedBy: rig.memberId,
    });
  });

  it('keeps versions, stars, links and the grants of other people', async () => {
    const { store } = rig.opened;
    store.driveStars.star(rig.ownerId, trip.id);
    store.driveGrants.set(
      { itemId: trip.id, profileId: kimId, role: 'view', expiresAt: null },
      rig.ownerId,
    );
    store.driveGrants.set(
      { itemId: deep.id, profileId: rig.memberId, role: 'view', expiresAt: null },
      rig.ownerId,
    );
    const versions = store.driveVersions.forItem(note.id, null, 10).versions;
    expect(versions).toHaveLength(1);
    await transfers.answer(member(), offer(), { accept: true });
    expect(store.driveItems.byId(trip.id, rig.ownerId).starred).toBe(true);
    expect(accessTo(kimId, deep.id)).toBe('view');
    expect(store.driveGrants.forPerson(deep.id, rig.memberId)).toBeUndefined();
    const kept = store.driveVersions.forItem(note.id, null, 10).versions;
    expect(kept.map((version) => version.id)).toEqual(versions.map((version) => version.id));
    const entry = store.driveVersions.byId(versions[0]?.id ?? '');
    expect(entry.rootId).toBe(rig.theirs.id);
    expect(entry.version.addedByProfileId).toBe(rig.memberId);
    const sha = versions[0]?.sha256 ?? '';
    const stored = join(rig.theirs.path, '.smarteverything', 'versions', sha.slice(0, 2), sha);
    expect(await exists(stored)).toBe(true);
    const source = join(rig.mine.path, '.smarteverything', 'versions', sha.slice(0, 2), sha);
    expect(await exists(source)).toBe(false);
  });

  it('numbers the moved folder when the recipient already has one with that name', async () => {
    await rig.seedFolder(rig.theirs, 'Trip');
    await transfers.answer(member(), offer(), { accept: true });
    const moved = rig.opened.store.driveItems.byId(trip.id, rig.memberId);
    expect(moved.relPath).toBe('Trip (2)');
    expect(await readFile(join(rig.theirs.path, 'Trip (2)', 'note.txt'), 'utf8')).toBe(
      'second words, longer',
    );
  });

  it('moves a single file the same way', async () => {
    const loose = await rig.seedFile(rig.mine, 'loose.txt', 'loose');
    await transfers.answer(member(), offer(loose.id), { accept: true });
    expect(rig.opened.store.driveItems.byId(loose.id, rig.memberId)).toMatchObject({
      rootId: rig.theirs.id,
      relPath: 'loose.txt',
      parentId: null,
    });
    expect(await readdir(rig.theirs.path)).toContain('loose.txt');
  });

  it('re-points a placement of the moved folder to the new drive and tells its computer', async () => {
    rig.mount(rig.ownerNode, rig.ownerId, rig.mine, trip.id);
    const placement = rig.opened.store.drivePlacements
      .forDevice(rig.ownerNode)
      .find((row) => row.folderItemId === trip.id);
    expect(placement?.rootId).toBe(rig.mine.id);
    const heard: (readonly string[])[] = [];
    placements.onDeviceChanged((devices) => heard.push(devices));
    await transfers.answer(member(), offer(), { accept: true });
    expect(rig.opened.store.drivePlacements.byId(placement?.id ?? '')).toMatchObject({
      rootId: rig.theirs.id,
      folderItemId: trip.id,
    });
    expect(heard).toContainEqual([rig.ownerNode]);
  });

  it('adds the moved items to the feed of the new drive', async () => {
    const before = rig.opened.store.driveFeed.latestSeqInRoot(rig.theirs.id);
    await transfers.answer(member(), offer(), { accept: true });
    const rows = rig.opened.store.driveFeed.sinceInRoot(rig.theirs.id, before, 100).rows;
    expect(new Set(rows.map((row) => row.itemId))).toEqual(
      new Set([trip.id, sub.id, note.id, deep.id]),
    );
    expect(rows.every((row) => row.op === 'create')).toBe(true);
  });

  it('moves the bytes in the usage of the people', async () => {
    const { store } = rig.opened;
    const before = store.driveQuotas.usage(rig.ownerId);
    await transfers.answer(member(), offer(), { accept: true });
    expect(store.driveQuotas.usage(rig.ownerId).live).toBeLessThan(before.live);
    expect(store.driveQuotas.usage(rig.memberId).live).toBe(
      before.live - store.driveQuotas.usage(rig.ownerId).live,
    );
  });

  it('refuses when it would not fit the quota of the recipient, names the shortfall and moves nothing', async () => {
    const { store } = rig.opened;
    store.driveQuotas.set(rig.memberId, 5);
    const id = offer();
    const error = await refused(() => transfers.answer(member(), id, { accept: true }));
    expect(error).toBeInstanceOf(DriveQuotaExceededError);
    expect(error instanceof Error ? error.message : '').toMatch(/space limit is 5 bytes/u);
    expect(store.driveTransfers.byId(id).state).toBe('offered');
    expect(store.driveItems.byId(trip.id, rig.ownerId).rootId).toBe(rig.mine.id);
    expect(await exists(join(rig.mine.path, 'Trip', 'note.txt'))).toBe(true);
    expect(await exists(join(rig.theirs.path, 'Trip'))).toBe(false);
    store.driveQuotas.set(rig.memberId, null);
    expect((await transfers.answer(member(), id, { accept: true })).state).toBe('accepted');
  });

  it('refuses when the item no longer belongs to the sender', async () => {
    const id = offer();
    await transfers.answer(member(), id, { accept: true });
    const again = rig.opened.store.driveTransfers.offer({
      itemId: trip.id,
      fromProfileId: rig.ownerId,
      toProfileId: kimId,
    });
    expect(
      await refused(() => transfers.answer({ profileId: kimId }, again.id, { accept: true })),
    ).toMatchObject({ code: 'conflict' });
  });
});

describe('what a transfer leaves behind', () => {
  it('hands the public links of the moved items to the new owner', async () => {
    const { store } = rig.opened;
    const shares = new DriveShares({
      store,
      origin: (): ShareOrigin => ({ url: 'https://hub.example', public: true }),
      now: (): Date => new Date(),
    });
    const link = store.driveShares.insert({
      id: newId(),
      itemId: deep.id,
      tokenHash: 'a'.repeat(64),
      permission: 'view',
      expiresAt: null,
      passwordHash: null,
      createdBy: rig.ownerId,
      createdAt: new Date().toISOString(),
    });
    await transfers.answer(member(), offer(), { accept: true });
    expect(shares.list(owner(), deep.id)).toEqual([]);
    expect(shares.list(member(), deep.id).map((row) => row.id)).toEqual([link.id]);
    expect(shares.revoke(member(), link.id).revokedAt).not.toBeNull();
  });

  it('refuses to cancel while the offer is being accepted and finishes the transfer', async () => {
    const id = offer();
    const accepting = transfers.answer(member(), id, { accept: true });
    expect(await refused(() => transfers.cancel(owner(), id))).toMatchObject({
      code: 'conflict',
    });
    expect((await accepting).state).toBe('accepted');
    expect(rig.opened.store.driveTransfers.byId(id).state).toBe('accepted');
  });

  it('purges the trashed items of the moved folder instead of orphaning them', async () => {
    const { store } = rig.opened;
    const outside = await rig.seedFile(rig.mine, 'outside.txt', 'stays');
    await commitTrash(rig.changeEnv(), rig.mine, deep.id, {
      actorProfileId: rig.ownerId,
      via: 'app',
      deviceId: null,
    });
    await commitTrash(rig.changeEnv(), rig.mine, outside.id, {
      actorProfileId: rig.ownerId,
      via: 'app',
      deviceId: null,
    });
    expect(store.driveTrash.find(deep.id)).toBeDefined();
    await transfers.answer(member(), offer(), { accept: true });
    expect(store.driveTrash.find(deep.id)).toBeUndefined();
    expect(store.driveTrash.find(outside.id)).toBeDefined();
  });

  it('refuses to give away the locked folder or anything in it', async () => {
    const locked = await rig.seedFolder(rig.mine, '.locked');
    const inside = await rig.seedFile(rig.mine, '.locked/secret.txt', 'secret');
    const opened = { profileId: rig.ownerId, lockedFolder: 'open' } as const;
    for (const target of [locked, inside]) {
      expect(
        await refused(() =>
          transfers.offer(opened, { itemId: target.id, toProfileId: rig.memberId }),
        ),
      ).toMatchObject({ code: 'forbidden' });
    }
  });
});
