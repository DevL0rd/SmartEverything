import { randomUUID } from 'node:crypto';
import type { CommittedNotice } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileDraft } from '../../../apps/hub/src/drive/changes';
import { DriveBackupRepository } from '../../../apps/hub/src/store/repositories/drive-backup';
import {
  backupStatus,
  INITIAL_BACKUP_STATUS,
} from '../../../apps/app/src/features/photos/backup/model/status';
import {
  digestOf,
  rig,
  rowOf,
  type Rig,
} from '../../../apps/app/src/features/photos/backup/runner/fixtures';
import {
  LEDGER_STORAGE_KEY,
  loadLedger,
} from '../../../apps/app/src/features/photos/backup/runner/ledger-store';
import { BackupRunner } from '../../../apps/app/src/features/photos/backup/runner/runner';
import { protocolFixture, type ProtocolFixture } from './fixture';

const UPLOADED_AT = '2026-11-06T00:00:00.000Z';
let fixture: ProtocolFixture;
let local: Rig;
let repository: DriveBackupRepository;

beforeEach(async () => {
  fixture = await protocolFixture();
  local = rig();
  repository = new DriveBackupRepository(fixture.opened.store.context);
  backupStatus.set(INITIAL_BACKUP_STATUS);
});

afterEach(async () => {
  await fixture.close();
});

function addHeldItem(): string {
  return fixture.opened.store.driveItems.write({
    item: fileDraft(
      {
        rootId: fixture.root.id,
        parentId: fixture.folderId,
        relPath: 'Uploads/a.jpg',
        modifiedAt: UPLOADED_AT,
        addedAt: UPLOADED_AT,
        outside: false,
        addedByProfileId: fixture.profileId,
      },
      { bytes: 1000, sha256: digestOf('a@1000') },
    ),
    identity: { dev: '1', ino: '2' },
  }).item.id;
}

function seedLegacy(itemId: string | null): void {
  const device = repository.findDeviceByHubDevice(fixture.phoneId);
  if (device === undefined) throw new Error('Missing isolated backup device');
  repository.touchDevice(device.id, UPLOADED_AT);
  repository.saveAsset({
    backup_device_id: device.id,
    local_id: 'a',
    item_id: itemId,
    sha256: digestOf('a@1000'),
    state: itemId === null ? 'uploading' : 'verified',
    at: UPLOADED_AT,
  });
  local.library.rows = [rowOf('a', 1000)];
  local.storage.values.set(
    LEDGER_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      lastSeen: 5000,
      entries: [
        {
          localId: 'a',
          sha256: digestOf('a@1000'),
          bytes: 1000,
          modificationTime: 1000,
          uploadedAt: UPLOADED_AT,
        },
      ],
    }),
  );
}

function runner(): BackupRunner {
  const { service, profileId, phoneId, opened } = fixture;
  return new BackupRunner({
    ...local.ports,
    identity: { ...local.ports.identity, deviceId: phoneId },
    hub: {
      register: (): Promise<unknown> => Promise.resolve({}),
      lookupHashes: (input) =>
        opened.store.host.read('photoBackupLookup', { profileId, request: input }),
      checkBackup: (input) =>
        opened.store.host.write('photoBackupCheck', { profileId, request: input }),
      resolveTarget: (deviceId, takenAt) => service.backupTarget(profileId, deviceId, takenAt),
      folderCopies: (input) =>
        opened.store.host.read('photoBackupCopies', { profileId, request: input }),
      origins: (input) =>
        opened.store.host.read('photoBackupOrigins', { profileId, request: input }),
    },
  });
}

async function snapshot(): Promise<unknown> {
  const device = repository.findDeviceByHubDevice(fixture.phoneId);
  if (device === undefined) throw new Error('Missing isolated backup device');
  return {
    device,
    assets: repository.assetsOf(device.id),
    state: await fixture.opened.store.host.read('photoBackupState', {
      profileId: fixture.profileId,
    }),
  };
}

function resentAt(before: unknown, at: string): unknown {
  const stamped = JSON.stringify(before).replace(
    new RegExp(`"(at|last_seen_at|lastSeenAt|lastBackupAt)":"${UPLOADED_AT}"`, 'g'),
    `"$1":"${at}"`,
  );
  return JSON.parse(stamped);
}

describe('legacy backup identity lookup against the actual backup service', () => {
  it.each([true, false])(
    'keeps the backup state and resends only the folder of a canonical copy that exists: %s',
    async (held) => {
      const itemId = held ? addHeldItem() : null;
      seedLegacy(itemId);
      const before = await snapshot();
      const notices: CommittedNotice[] = [];
      const off = fixture.opened.store.feed.subscribeNotices((notice) => {
        notices.push(notice);
      });
      await runner().request();
      off();
      expect(await snapshot()).toEqual(
        held ? resentAt(before, fixture.opened.store.now().toISOString()) : before,
      );
      expect(notices).toEqual(
        held
          ? [expect.objectContaining({ type: 'drive_changed', rootIds: [fixture.root.id] })]
          : [],
      );
      expect(local.native.hashed).toEqual([]);
      expect(local.upload.started).toEqual([]);
      expect(backupStatus.get()).toMatchObject({ total: 0, done: 0, failed: 0, bytesLeft: 0 });
      const ledger = await loadLedger(local);
      expect(ledger.lastSeen).toBe(5000);
      expect(ledger.find('a')).toMatchObject({ itemId, uploadedAt: UPLOADED_AT });
    },
  );

  it('does not resolve identities belonging to another profile', async () => {
    const input = {
      deviceId: fixture.phoneId,
      assets: [{ localId: 'a', sha256: digestOf('a@1000') }],
    };
    await expect(
      fixture.opened.store.host.read('photoBackupLookup', {
        profileId: randomUUID(),
        request: input,
      }),
    ).rejects.toThrow('not registered for backup');
  });
});
