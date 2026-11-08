import {
  ApiError,
  BACKUP_DEVICE,
  BACKUP_SETTINGS,
  type BackupDevice,
  type BackupHave,
  type BackupHaveResult,
  type BackupRegister,
  type BackupState,
  type DriveItem,
} from '@smarteverything/domain';
import { z } from 'zod';
import {
  folderDraft,
  identityOf,
  isoOf,
  recordItem,
  type ChangeActor,
  type ChangeEnv,
  type ChangeStore,
} from '../drive/changes';
import { DriveWriteError, locate, physicalRoot, type DriveWriteRoot } from '../drive/intents';
import type {
  DriveBackupDeviceRow,
  DriveBackupRepository,
} from '../store/repositories/drive-backup';
import type { DevicesRepository } from '../store/repositories/devices';
import type { ProfilesRepository } from '../store/repositories/profiles';
import { inList, type Sql } from '../store/sql';

import { LOCAL_MONTH } from './timeline';

export const CAMERA_ROLL = 'Camera roll';

export const UPLOADS = 'Uploads';

export interface BackupStore extends ChangeStore {
  readonly driveBackup: DriveBackupRepository;
  readonly devices: Pick<DevicesRepository, 'find'>;
  readonly profiles: Pick<ProfilesRepository, 'byId'>;
}

export interface BackupEnv extends ChangeEnv {
  readonly store: BackupStore;
  readonly sql: Sql;
}

export interface BackupTarget {
  readonly folderId: string;
  readonly path: string;
}

const HELD = z.strictObject({ id: z.string(), sha256: z.string() });

const MOMENT_AT = z.strictObject({ at: z.string().nullable() });

const BYTES_LEFT = z.strictObject({ left: z.int().nonnegative() });

function asRow(row: DriveBackupDeviceRow): BackupDevice {
  return BACKUP_DEVICE.parse({
    id: row.id,
    profileId: row.profile_id,
    deviceId: row.device_id,
    name: row.name,
    platform: row.platform,
    lastSeenAt: row.last_seen_at,
    settings: BACKUP_SETTINGS.parse(row.settings),
  });
}

function folderName(name: string, fallback: string): string {
  const cleaned = Array.from(name.normalize('NFC'))
    .map((character) =>
      character === '/' || character === '\\' || character === '\0' ? '-' : character,
    )
    .join('')
    .trim();
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? fallback : cleaned;
}

export class BackupService {
  private lane: Promise<unknown> = Promise.resolve();

  constructor(private readonly env: BackupEnv) {}

  registerDevice(profileId: string, input: BackupRegister): BackupDevice {
    const { store } = this.env;
    if (store.devices.find(input.deviceId) === undefined) {
      throw new ApiError('not_found', 'The hub does not know this phone.');
    }
    const existing = store.driveBackup.findDeviceByHubDevice(input.deviceId);
    if (existing !== undefined && existing.profile_id !== profileId) {
      throw new ApiError('conflict', 'This phone already backs up for another person.');
    }
    const seenAt = this.env.now().toISOString();
    const row = store.write(() => {
      const device =
        existing === undefined
          ? store.driveBackup.registerDevice({
              profile_id: profileId,
              device_id: input.deviceId,
              name: input.name,
              platform: input.platform,
              last_seen_at: seenAt,
              settings: input.settings,
            })
          : store.driveBackup.saveSettings(existing.id, input.settings);
      store.driveBackup.touchDevice(device.id, seenAt);
      this.announceProfile(profileId);
      return device;
    });
    this.env.log.info('photos_backup.registered', {
      backupDeviceId: row.id,
      platform: row.platform,
    });
    return asRow({ ...row, last_seen_at: seenAt });
  }

  lookupHashes(profileId: string, input: BackupHave): BackupHaveResult {
    this.deviceOf(profileId, input.deviceId);
    const held = this.heldItems(
      profileId,
      input.assets.map((asset) => asset.sha256),
    );
    const have: { localId: string; itemId: string }[] = [];
    const missing: string[] = [];
    for (const asset of input.assets) {
      const itemId = held.get(asset.sha256);
      if (itemId === undefined) missing.push(asset.localId);
      else have.push({ localId: asset.localId, itemId });
    }
    return { have, missing };
  }

  checkHashes(profileId: string, input: BackupHave): BackupHaveResult {
    const device = this.deviceOf(profileId, input.deviceId);
    const now = this.env.now().toISOString();
    const held = this.heldItems(
      profileId,
      input.assets.map((asset) => asset.sha256),
    );
    const have: { localId: string; itemId: string }[] = [];
    const missing: string[] = [];
    this.env.store.write(() => {
      this.env.store.driveBackup.touchDevice(device.id, now);
      for (const asset of input.assets) {
        const itemId = held.get(asset.sha256) ?? null;
        this.env.store.driveBackup.saveAsset({
          backup_device_id: device.id,
          local_id: asset.localId,
          item_id: itemId,
          sha256: asset.sha256,
          state: itemId === null ? 'uploading' : 'verified',
          at: now,
        });
        if (itemId === null) {
          missing.push(asset.localId);
        } else {
          have.push({ localId: asset.localId, itemId });
        }
      }
      this.announceProfile(
        profileId,
        have.map((asset) => asset.itemId),
      );
    });
    return { have, missing };
  }

  settleItem(item: DriveItem): number {
    if (item.kind === 'folder' || item.sha256 === null || item.integrity !== 'ok') {
      return 0;
    }
    const { driveBackup, driveRoots } = this.env.store;
    const root = driveRoots.find(item.rootId);
    const now = this.env.now().toISOString();
    const waiting = driveBackup
      .withHashes([item.sha256])
      .filter((asset) => asset.state !== 'verified')
      .filter((asset) => {
        const owner = driveBackup.deviceById(asset.backup_device_id).profile_id;
        return root?.kind === 'managed' && (root.scope === 'home' || root.ownerProfileId === owner);
      });
    this.env.store.write(() => {
      for (const asset of waiting) {
        driveBackup.saveAsset({ ...asset, item_id: item.id, state: 'verified', at: now });
      }
      const owners = new Set(
        waiting.map((asset) => driveBackup.deviceById(asset.backup_device_id).profile_id),
      );
      for (const owner of owners) this.announceProfile(owner, [item.id]);
    });
    return waiting.length;
  }

  state(profileId: string): BackupState[] {
    const target = `${CAMERA_ROLL}/${this.personFolder(profileId)}`;
    return this.env.store.driveBackup.devicesOf(profileId).map((row) => {
      const counts = new Map(
        this.env.store.driveBackup.coverage(row.id).map((entry) => [entry.state, entry.total]),
      );
      return {
        device: asRow(row),
        backedUp: counts.get('verified') ?? 0,
        pending: counts.get('uploaded') ?? 0,
        uploading: counts.get('uploading') ?? 0,
        failed: counts.get('failed') ?? 0,
        bytesLeft: this.bytesLeft(profileId),
        lastBackupAt: this.lastBackupAt(row.id),
        targetFolder: target,
      };
    });
  }

  async backupTarget(profileId: string, deviceId: string, takenAt: string): Promise<BackupTarget> {
    const device = this.deviceOf(profileId, deviceId);
    this.env.store.driveBackup.touchDevice(device.id, this.env.now().toISOString());
    return await this.serialized(() =>
      this.ensure(profileId, [
        CAMERA_ROLL,
        this.personFolder(profileId),
        takenAt.slice(0, 4),
        takenAt.slice(0, 7),
      ]),
    );
  }

  manualTarget(profileId: string): Promise<BackupTarget> {
    return this.serialized(() => this.ensure(profileId, [UPLOADS, this.personFolder(profileId)]));
  }

  private announceProfile(profileId: string, itemIds: readonly string[] = []): void {
    const filter = inList('i.id', 'items', itemIds);
    const items = this.env.sql.all(
      z.strictObject({ root_id: z.string(), month: z.string().nullable() }),
      `select distinct i.root_id, ${LOCAL_MONTH} as month from drive_items i
       left join drive_media m on m.item_id = i.id where ${filter.text}`,
      filter.parameters,
    );
    const roots = this.env.store.driveRoots
      .list()
      .filter(
        (root) =>
          root.kind === 'managed' && root.scope === 'person' && root.ownerProfileId === profileId,
      );
    this.env.store.feed.notice({
      type: 'drive_changed',
      rootIds: [
        ...new Set([...roots.map((root) => root.id), ...items.map((item) => item.root_id)]),
      ],
      folderIds: [],
      albumIds: [],
      months: [
        ...new Set(items.flatMap((item) => (item.month === null ? [] : [item.month]))),
      ].sort(),
      cursor: this.env.store.driveFeed.latestSeq(),
    });
  }

  private deviceOf(profileId: string, hubDeviceId: string): DriveBackupDeviceRow {
    const row = this.env.store.driveBackup.findDeviceByHubDevice(hubDeviceId);
    if (row?.profile_id !== profileId) {
      throw new ApiError('not_found', 'This phone is not registered for backup.');
    }
    return row;
  }

  private personFolder(profileId: string): string {
    return folderName(this.env.store.profiles.byId(profileId).name, profileId);
  }

  private heldItems(profileId: string, hashes: readonly string[]): Map<string, string> {
    const filter = inList('i.sha256', 'hashes', [...new Set(hashes)]);
    const rows = this.env.sql.all(
      HELD,
      `select i.id, i.sha256 from drive_items i join drive_roots r on r.id = i.root_id
       where ${filter.text} and i.kind <> 'folder' and i.integrity = 'ok'
         and r.kind = 'managed' and (r.scope = 'home' or r.owner_profile_id = $profileId)
       order by i.added_at, i.id`,
      { ...filter.parameters, profileId },
    );
    const held = new Map<string, string>();
    for (const row of rows) {
      if (!held.has(row.sha256)) {
        held.set(row.sha256, row.id);
      }
    }
    return held;
  }

  private bytesLeft(profileId: string): number {
    return (
      this.env.sql.get(
        BYTES_LEFT,
        `select coalesce(sum(u.length - u.offset), 0) as left
           from drive_uploads u join drive_items f on f.id = u.target_id
          where u.profile_id = $profileId and u.state = 'open' and u.target_kind = 'folder'
            and substr(f.rel_path, 1, $prefixLength) = $prefix`,
        {
          profileId,
          prefix: `${CAMERA_ROLL}/`,
          prefixLength: CAMERA_ROLL.length + 1,
        },
      )?.left ?? 0
    );
  }

  private lastBackupAt(backupDeviceId: string): string | null {
    return (
      this.env.sql.get(
        MOMENT_AT,
        `select max(at) as at from drive_backup_assets
          where backup_device_id = $backupDeviceId and state = 'verified'`,
        { backupDeviceId },
      )?.at ?? null
    );
  }

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const run = this.lane.then(work, work);
    this.lane = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async ensure(
    profileId: string,
    segments: readonly [string, ...string[]],
  ): Promise<BackupTarget> {
    const root = this.personRoot(profileId);
    const actor: ChangeActor = { actorProfileId: profileId, via: 'app', deviceId: null };
    const [head, ...rest] = segments;
    let folder = await this.ensureFolder(root, actor, null, head);
    for (const segment of rest) {
      folder = await this.ensureFolder(root, actor, folder, `${folder.relPath}/${segment}`);
    }
    return { folderId: folder.id, path: folder.relPath };
  }

  private personRoot(profileId: string): DriveWriteRoot {
    const root = this.env.store.driveRoots
      .list()
      .find(
        (candidate) =>
          candidate.kind === 'managed' &&
          candidate.scope === 'person' &&
          candidate.ownerProfileId === profileId,
      );
    if (root === undefined) {
      throw new ApiError('not_found', 'This person has no library folder to put photos in.');
    }
    return physicalRoot(root);
  }

  private async ensureFolder(
    root: DriveWriteRoot,
    actor: ChangeActor,
    parent: DriveItem | null,
    relPath: string,
  ): Promise<DriveItem> {
    const { driveItems } = this.env.store;
    const indexed = driveItems.byPath(root.id, relPath);
    if (indexed !== undefined) {
      if (indexed.kind !== 'folder') {
        throw new ApiError('conflict', `A file named ${relPath} is in the way of the folder.`);
      }
      return indexed;
    }
    const absolute = await locate(root, relPath);
    await this.env.files.mkdir(absolute);
    const stamp = await this.env.files.stamp(absolute);
    if (stamp?.directory !== true) {
      throw new DriveWriteError('missing', `The folder ${relPath} is missing after it was made.`);
    }
    return recordItem(this.env, {
      draft: folderDraft(
        {
          rootId: root.id,
          parentId: parent?.id ?? null,
          relPath,
          modifiedAt: isoOf(stamp.mtimeNs),
          addedAt: this.env.now().toISOString(),
          outside: false,
          addedByProfileId: actor.actorProfileId,
        },
        0,
      ),
      identity: identityOf(stamp),
      op: 'create',
      actor,
    });
  }
}
