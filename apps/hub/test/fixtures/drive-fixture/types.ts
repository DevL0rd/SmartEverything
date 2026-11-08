import type { DriveAlbum } from '../../../../../packages/domain/src/drive/album';
import type { DriveConflict } from '../../../../../packages/domain/src/drive/conflict';
import type { DriveItem } from '../../../../../packages/domain/src/drive/item';
import type { DriveQuota } from '../../../../../packages/domain/src/drive/quota';
import type { DriveRoot } from '../../../../../packages/domain/src/drive/root';
import type { DriveSettings } from '../../../../../packages/domain/src/drive/settings';
import type { DriveShare } from '../../../../../packages/domain/src/drive/share';
import type { DriveSyncClient } from '../../../../../packages/domain/src/drive/sync-client';
import type { DriveTrashEntry } from '../../../../../packages/domain/src/drive/trash';
import type { DriveUsage } from '../../../../../packages/domain/src/drive/usage';
import type { DriveVersion } from '../../../../../packages/domain/src/drive/version';

export const DRIVE_FIXTURE_SIZES = { empty: 0, small: 240, large: 100_000 } as const;

export type DriveFixtureSize = keyof typeof DRIVE_FIXTURE_SIZES;

export interface DriveFixtureOptions {
  readonly seed: number;
  readonly size: DriveFixtureSize;
}

export interface DriveFixturePerson {
  readonly id: string;
  readonly name: string;
  readonly owner: boolean;
}

export interface DriveFixtureAlbumItem {
  readonly albumId: string;
  readonly itemId: string;
  readonly position: number;
}

export interface DriveFixture {
  readonly seed: number;
  readonly size: DriveFixtureSize;
  readonly now: string;
  readonly people: readonly DriveFixturePerson[];
  readonly deviceIds: readonly string[];
  readonly roots: readonly DriveRoot[];
  readonly items: readonly DriveItem[];
  readonly albums: readonly DriveAlbum[];
  readonly albumItems: readonly DriveFixtureAlbumItem[];
  readonly trash: readonly DriveTrashEntry[];
  readonly versions: readonly DriveVersion[];
  readonly shares: readonly DriveShare[];
  readonly syncClients: readonly DriveSyncClient[];
  readonly conflicts: readonly DriveConflict[];
  readonly quotas: readonly DriveQuota[];
  readonly usage: readonly DriveUsage[];
  readonly settings: DriveSettings;
}
