import { randomUUID } from 'node:crypto';
import {
  ApiError,
  DRIVE_OFFLINE_CHANGED_PAYLOAD,
  type DriveItem,
  type PushCommand,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DriveOffline } from '../../src/drive/offline';
import { VIEW_ONLY_REASON } from '../../src/drive/sharing/export-guard';
import type { PushCommandOutcome, PushCommandRequest } from '../../src/extensions/push/commands';
import { captureLogs, testLogger } from '../support/logs';
import { openFsRig, type FsRig } from './fs-rig';

let rig: FsRig;
let offline: DriveOffline;
let stop: () => void;
let sent: PushCommandRequest[];
let outcome: PushCommandOutcome;
let ownerPhone: string;
let samPhone: string;
let folder: DriveItem;
let inside: DriveItem;
let outside: DriveItem;

function phone(profileId: string, platform: 'android' | 'desktop'): string {
  const { clients } = rig.opened.store;
  const created = clients.create({
    name: `${platform} of ${profileId.slice(0, 4)}`,
    platform,
    role: 'member',
    tokenHash: randomUUID().replaceAll('-', '').padEnd(64, 'f'),
  });
  clients.useProfile(created.id, profileId);
  return created.id;
}

function noticeFor(item: DriveItem): void {
  const { store } = rig.opened;
  store.feed.notice({
    type: 'drive_changed',
    rootIds: [item.rootId],
    folderIds: [],
    albumIds: [],
    months: [],
    cursor: store.driveFeed.latestSeq(),
  });
}

async function settle(): Promise<void> {
  await offline.idle();
}

async function refusal(work: () => unknown): Promise<ApiError> {
  try {
    await work();
  } catch (cause) {
    if (cause instanceof ApiError) return cause;
    throw cause;
  }
  throw new Error('the call was not refused');
}

function owner(): { profileId: string } {
  return { profileId: rig.ownerId };
}

function sam(): { profileId: string } {
  return { profileId: rig.memberId };
}

function commands(): { clientId: string; command: PushCommand; itemIds: readonly string[] }[] {
  return sent.map((request) => ({
    clientId: request.clientId,
    command: request.command,
    itemIds: DRIVE_OFFLINE_CHANGED_PAYLOAD.parse(request.payload).itemIds,
  }));
}

beforeEach(async () => {
  captureLogs();
  rig = await openFsRig();
  sent = [];
  outcome = { outcome: 'sent' };
  ownerPhone = phone(rig.ownerId, 'android');
  samPhone = phone(rig.memberId, 'android');
  folder = await rig.seedFolder(rig.mine, 'trip');
  inside = await rig.seedFile(rig.mine, 'trip/map.txt', 'map');
  outside = await rig.seedFile(rig.mine, 'notes.txt', 'notes');
  offline = new DriveOffline({
    store: rig.opened.store,
    push: {
      send: (request): Promise<PushCommandOutcome> => {
        sent.push(request);
        return Promise.resolve(outcome);
      },
    },
    log: testLogger('offline'),
  });
  stop = offline.start();
  await offline.ready();
});

afterEach(async () => {
  stop();
  await rig.opened.close();
});

describe('keeping a file offline on a phone', () => {
  it('pins a folder for the person’s own phone and tells that phone to fetch it', async () => {
    await offline.set(owner(), { clientId: ownerPhone, itemId: folder.id, on: true });
    await settle();
    expect(rig.opened.store.driveOffline.find(ownerPhone, folder.id)?.state).toBe('waiting');
    expect(commands()).toEqual([
      { clientId: ownerPhone, command: 'drive_offline_changed', itemIds: [folder.id] },
    ]);
  });

  it('refuses a phone that is not the person’s own or is not a phone', async () => {
    const desktop = phone(rig.ownerId, 'desktop');
    for (const clientId of [samPhone, desktop, randomUUID()]) {
      const refused = await refusal(async () => {
        await offline.set(owner(), { clientId, itemId: folder.id, on: true });
      });
      expect(refused.code).toBe('not_found');
    }
    expect(rig.opened.store.driveOffline.forProfile(rig.ownerId, null, null, 10).items).toEqual([]);
  });

  it('refuses an item the person cannot open', async () => {
    const refused = await refusal(async () => {
      await offline.set(sam(), { clientId: samPhone, itemId: folder.id, on: true });
    });
    expect(refused.code).toBe('not_found');
  });

  it('refuses a view only item for a view grantee and allows an edit grantee', async () => {
    const { store } = rig.opened;
    store.driveGrants.set(
      { itemId: folder.id, profileId: rig.memberId, role: 'view', expiresAt: null },
      rig.ownerId,
    );
    store.driveLocks.set(folder.id, rig.ownerId, true);
    const refused = await refusal(async () => {
      await offline.set(sam(), { clientId: samPhone, itemId: folder.id, on: true });
    });
    expect(refused.reason).toBe(VIEW_ONLY_REASON);
    store.driveGrants.set(
      { itemId: folder.id, profileId: rig.memberId, role: 'edit', expiresAt: null },
      rig.ownerId,
    );
    await offline.set(sam(), { clientId: samPhone, itemId: folder.id, on: true });
    expect(store.driveOffline.find(samPhone, folder.id)?.profileId).toBe(rig.memberId);
  });

  it('stops keeping an item when switched off', async () => {
    await offline.set(owner(), { clientId: ownerPhone, itemId: outside.id, on: true });
    await offline.set(owner(), { clientId: ownerPhone, itemId: outside.id, on: false });
    expect(rig.opened.store.driveOffline.find(ownerPhone, outside.id)).toBeUndefined();
  });

  it('still keeps the pin when the push could not be sent', async () => {
    outcome = { outcome: 'no_target', reason: 'no push token' };
    await offline.set(owner(), { clientId: ownerPhone, itemId: outside.id, on: true });
    await settle();
    expect(rig.opened.store.driveOffline.find(ownerPhone, outside.id)).toBeDefined();
  });

  it('lists only the caller’s pins, one phone at a time when asked', async () => {
    await offline.set(owner(), { clientId: ownerPhone, itemId: folder.id, on: true });
    await offline.set(owner(), { clientId: ownerPhone, itemId: outside.id, on: true });
    expect((await offline.list(owner(), undefined, undefined)).items).toHaveLength(2);
    expect((await offline.list(owner(), samPhone, undefined)).items).toEqual([]);
    expect((await offline.list(sam(), undefined, undefined)).items).toEqual([]);
  });

  it('records what the phone reports and ignores items it does not keep', async () => {
    await offline.set(owner(), { clientId: ownerPhone, itemId: outside.id, on: true });
    await offline.report(owner(), {
      clientId: ownerPhone,
      items: [
        { itemId: outside.id, state: 'ready', bytes: 5, rev: outside.rev },
        { itemId: inside.id, state: 'failed', error: 'no room' },
      ],
    });
    const row = rig.opened.store.driveOffline.find(ownerPhone, outside.id);
    expect(row?.state).toBe('ready');
    expect(row?.bytes).toBe(5);
    expect(rig.opened.store.driveOffline.find(ownerPhone, inside.id)).toBeUndefined();
  });

  it('refuses a report for another person’s phone', async () => {
    const refused = await refusal(async () => {
      await offline.report(owner(), {
        clientId: samPhone,
        items: [{ itemId: outside.id, state: 'failed', error: 'x' }],
      });
    });
    expect(refused.code).toBe('not_found');
  });
});

describe('telling a phone that something it keeps changed', () => {
  beforeEach(async () => {
    await offline.set(owner(), { clientId: ownerPhone, itemId: folder.id, on: true });
    await settle();
    sent = [];
  });

  it('sends the changed item when a file under the pinned folder changes', async () => {
    await rig.seedFile(rig.mine, 'trip/map.txt', 'a newer map');
    noticeFor(inside);
    await settle();
    expect(commands()).toEqual([
      { clientId: ownerPhone, command: 'drive_offline_changed', itemIds: [inside.id] },
    ]);
  });

  it('sends nothing when a file elsewhere changes', async () => {
    await rig.seedFile(rig.mine, 'notes.txt', 'newer notes');
    noticeFor(outside);
    await settle();
    expect(commands()).toEqual([]);
  });

  it('sends the new file added under the pinned folder', async () => {
    const added = await rig.seedFile(rig.mine, 'trip/photo.txt', 'photo');
    noticeFor(added);
    await settle();
    expect(commands().at(-1)).toEqual({
      clientId: ownerPhone,
      command: 'drive_offline_changed',
      itemIds: [added.id],
    });
  });

  it('does not tell a phone about an item its person can no longer open', async () => {
    const { store } = rig.opened;
    const shared = await rig.seedFolder(rig.mine, 'shared');
    const grant = store.driveGrants.set(
      { itemId: shared.id, profileId: rig.memberId, role: 'view', expiresAt: null },
      rig.ownerId,
    );
    await offline.set(sam(), { clientId: samPhone, itemId: shared.id, on: true });
    await settle();
    sent = [];
    store.driveGrants.remove(grant.id);
    const changed = await rig.seedFile(rig.mine, 'shared/a.txt', 'a');
    noticeFor(changed);
    await settle();
    expect(commands()).toEqual([]);
  });

  it('does not tell a view grantee’s phone about a locked item', async () => {
    const { store } = rig.opened;
    const shared = await rig.seedFolder(rig.mine, 'locked');
    store.driveGrants.set(
      { itemId: shared.id, profileId: rig.memberId, role: 'view', expiresAt: null },
      rig.ownerId,
    );
    await offline.set(sam(), { clientId: samPhone, itemId: shared.id, on: true });
    await settle();
    sent = [];
    store.driveLocks.set(shared.id, rig.ownerId, true);
    const changed = await rig.seedFile(rig.mine, 'locked/a.txt', 'a');
    noticeFor(changed);
    await settle();
    expect(commands()).toEqual([]);
  });
});
