import { PHOTO_RAIL_COUNTS, type PhotoRailCounts } from '@smarteverything/domain';
import { driveSql, type DriveActor } from '../drive/access';
import { starredBy } from '../store/repositories/drive-stars';
import type { StoreContext } from '../store/context';
import type { SqlParameters } from '../store/sql';
import { z } from 'zod';
import { FILTER_SQL, PHOTO_FROM, PHOTO_SHOWN, visibility } from './library';
import { trashedPhotoMembership } from './membership';

const COUNT_FIELD = z.number().int().nonnegative();

const LIBRARY_ROW = z.strictObject({
  library: COUNT_FIELD,
  favourites: COUNT_FIELD,
  videos: COUNT_FIELD,
  screenshots: COUNT_FIELD,
  places: COUNT_FIELD,
});

const ONE = z.strictObject({ total: COUNT_FIELD });

const SCREENSHOT_SQL = FILTER_SQL.screenshots.replace(/^ and /, '');

export class RailCountsReader {
  constructor(private readonly context: StoreContext) {}

  read(actor: DriveActor): PhotoRailCounts {
    return PHOTO_RAIL_COUNTS.parse({
      ...this.library(actor),
      albums: this.total(
        `select count(*) as total from drive_albums a
         where a.scope = 'home' or a.owner_profile_id = $profile`,
        visibility(actor),
      ),
      duplicates: this.duplicates(actor),
      backupDevices: this.total(
        'select count(*) as total from drive_backup_devices d where d.profile_id = $profile',
        { profile: actor.profileId },
      ),
      deleted: this.total(
        `select count(*) as total from drive_trash t join drive_roots r on r.id = t.root_id
         where t.is_folder = 0 and ${trashedPhotoMembership()} and ${driveSql()}`,
        visibility(actor),
      ),
    });
  }

  private library(actor: DriveActor): z.output<typeof LIBRARY_ROW> {
    return (
      this.context.sql.get(
        LIBRARY_ROW,
        `select count(*) as library,
           coalesce(sum(${starredBy()}), 0) as favourites,
           coalesce(sum(i.kind = 'video'), 0) as videos,
           coalesce(sum(${SCREENSHOT_SQL}), 0) as screenshots,
           count(distinct m.place_id) as places
         from ${PHOTO_FROM} where ${PHOTO_SHOWN}`,
        visibility(actor),
      ) ?? { library: 0, favourites: 0, videos: 0, screenshots: 0, places: 0 }
    );
  }

  private duplicates(actor: DriveActor): number {
    return this.total(
      `select count(*) as total from (
         select i.sha256 from ${PHOTO_FROM}
         where ${PHOTO_SHOWN} and i.sha256 is not null
         group by i.sha256 having count(*) > 1)`,
      visibility(actor),
    );
  }

  private total(text: string, parameters: SqlParameters): number {
    return this.context.sql.get(ONE, text, parameters)?.total ?? 0;
  }
}
