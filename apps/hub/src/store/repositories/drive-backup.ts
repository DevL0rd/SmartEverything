import { z } from 'zod';
import { BACKUP_PLATFORMS } from '@smarteverything/domain';
import { found, type StoreContext } from '../context';
import { SQL_JSON, inList, jsonText } from '../sql';

export const DRIVE_BACKUP_PLATFORMS = BACKUP_PLATFORMS;

export const DRIVE_BACKUP_ASSET_STATES = ['uploading', 'uploaded', 'verified', 'failed'] as const;

const ID = z.string().min(1);

const SETTINGS = z.record(z.string(), z.unknown()).readonly();

const DEVICE_FIELDS = {
  id: ID,
  profile_id: ID,
  device_id: ID,
  name: z.string().trim().min(1),
  platform: z.enum(DRIVE_BACKUP_PLATFORMS),
  last_seen_at: z.string().min(1).nullable(),
};

export const DRIVE_BACKUP_DEVICE_ROW = z
  .strictObject({ ...DEVICE_FIELDS, settings: SETTINGS })
  .readonly();

const STORED_DEVICE = z
  .strictObject({ ...DEVICE_FIELDS, settings: SQL_JSON.pipe(SETTINGS) })
  .readonly();

export const DRIVE_BACKUP_ASSET_ROW = z
  .strictObject({
    backup_device_id: ID,
    local_id: ID,
    item_id: ID.nullable(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    state: z.enum(DRIVE_BACKUP_ASSET_STATES),
    at: z.string().min(1),
  })
  .readonly();

export type DriveBackupDeviceRow = z.infer<typeof DRIVE_BACKUP_DEVICE_ROW>;

export type DriveBackupAssetRow = z.infer<typeof DRIVE_BACKUP_ASSET_ROW>;

export type DriveBackupDeviceInput = Omit<DriveBackupDeviceRow, 'id'>;

export interface DriveBackupCoverage {
  readonly state: DriveBackupAssetRow['state'];
  readonly total: number;
}

const COVERAGE = z.strictObject({
  state: z.enum(DRIVE_BACKUP_ASSET_STATES),
  total: z.int().nonnegative(),
});

const DEVICE_COLUMNS = 'id, profile_id, device_id, name, platform, last_seen_at, settings';

const ASSET_COLUMNS = 'backup_device_id, local_id, item_id, sha256, state, at';

export class DriveBackupRepository {
  constructor(private readonly context: StoreContext) {}

  findDevice(id: string): DriveBackupDeviceRow | undefined {
    return this.context.sql.get(
      STORED_DEVICE,
      `select ${DEVICE_COLUMNS} from drive_backup_devices where id = $id`,
      { id },
    );
  }

  deviceById(id: string): DriveBackupDeviceRow {
    return found(this.findDevice(id), 'backup device', id);
  }

  findDeviceByHubDevice(deviceId: string): DriveBackupDeviceRow | undefined {
    return this.context.sql.get(
      STORED_DEVICE,
      `select ${DEVICE_COLUMNS} from drive_backup_devices where device_id = $deviceId`,
      { deviceId },
    );
  }

  devicesOf(profileId: string): DriveBackupDeviceRow[] {
    return this.context.sql.all(
      STORED_DEVICE,
      `select ${DEVICE_COLUMNS} from drive_backup_devices where profile_id = $profileId order by name, id`,
      { profileId },
    );
  }

  allDevices(): DriveBackupDeviceRow[] {
    return this.context.sql.all(
      STORED_DEVICE,
      `select ${DEVICE_COLUMNS} from drive_backup_devices order by name, id`,
    );
  }

  registerDevice(input: DriveBackupDeviceInput): DriveBackupDeviceRow {
    return this.context.write(() => {
      const row = DRIVE_BACKUP_DEVICE_ROW.parse({ ...input, id: this.context.newId() });
      this.context.sql.run(
        'register the backup device',
        `insert into drive_backup_devices (${DEVICE_COLUMNS})
         values ($id, $profile_id, $device_id, $name, $platform, $last_seen_at, $settings)`,
        { ...row, settings: jsonText(row.settings) },
      );
      return row;
    });
  }

  saveSettings(id: string, settings: Readonly<Record<string, unknown>>): DriveBackupDeviceRow {
    return this.context.write(() => {
      const after = DRIVE_BACKUP_DEVICE_ROW.parse({ ...this.deviceById(id), settings });
      this.context.sql.run(
        'change the backup device settings',
        'update drive_backup_devices set settings = $settings where id = $id',
        { id, settings: jsonText(settings) },
      );
      return after;
    });
  }

  touchDevice(id: string, seenAt: string): void {
    this.context.sql.run(
      'record when the backup device was seen',
      'update drive_backup_devices set last_seen_at = $seenAt where id = $id',
      { id, seenAt },
    );
  }

  removeDevice(id: string): void {
    this.context.sql.run(
      'remove the backup device',
      'delete from drive_backup_devices where id = $id',
      {
        id,
      },
    );
  }

  findAsset(backupDeviceId: string, localId: string): DriveBackupAssetRow | undefined {
    return this.context.sql.get(
      DRIVE_BACKUP_ASSET_ROW,
      `select ${ASSET_COLUMNS} from drive_backup_assets
       where backup_device_id = $backupDeviceId and local_id = $localId`,
      { backupDeviceId, localId },
    );
  }

  assetsOf(backupDeviceId: string): DriveBackupAssetRow[] {
    return this.context.sql.all(
      DRIVE_BACKUP_ASSET_ROW,
      `select ${ASSET_COLUMNS} from drive_backup_assets where backup_device_id = $backupDeviceId
       order by local_id`,
      { backupDeviceId },
    );
  }

  withHashes(hashes: readonly string[]): DriveBackupAssetRow[] {
    const filter = inList('sha256', 'hashes', hashes);
    return this.context.sql.all(
      DRIVE_BACKUP_ASSET_ROW,
      `select ${ASSET_COLUMNS} from drive_backup_assets where ${filter.text}
       order by backup_device_id, local_id`,
      filter.parameters,
    );
  }

  coverage(backupDeviceId: string): DriveBackupCoverage[] {
    return this.context.sql.all(
      COVERAGE,
      `select state, count(*) as total from drive_backup_assets
       where backup_device_id = $backupDeviceId group by state order by state`,
      { backupDeviceId },
    );
  }

  saveAsset(input: DriveBackupAssetRow): DriveBackupAssetRow {
    return this.context.write(() => {
      const row = DRIVE_BACKUP_ASSET_ROW.parse(input);
      this.context.sql.run(
        'save the backed-up asset',
        `insert into drive_backup_assets (${ASSET_COLUMNS})
         values ($backup_device_id, $local_id, $item_id, $sha256, $state, $at)
         on conflict (backup_device_id, local_id) do update set
           item_id = excluded.item_id, sha256 = excluded.sha256, state = excluded.state, at = excluded.at`,
        { ...row },
      );
      this.includePhoto(row);
      return row;
    });
  }

  private includePhoto(row: DriveBackupAssetRow): void {
    if (row.state !== 'verified' || row.item_id === null) return;
    this.context.sql.run(
      'include the verified backup in Photos',
      `insert into drive_photo_library (item_id, root_id)
       select id, root_id from drive_items where id = $itemId
       on conflict (item_id) do nothing`,
      { itemId: row.item_id },
    );
  }

  removeAsset(backupDeviceId: string, localId: string): void {
    this.context.sql.run(
      'forget the backed-up asset',
      'delete from drive_backup_assets where backup_device_id = $backupDeviceId and local_id = $localId',
      { backupDeviceId, localId },
    );
  }
}
