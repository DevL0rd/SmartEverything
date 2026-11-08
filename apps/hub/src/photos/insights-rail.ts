import { PHOTO_RAIL_COUNTS, type PhotoRailCounts } from '@smarteverything/domain';
import type { DriveActor } from '../drive/service-read';
import type { StoreContext } from '../store/context';
import type { SqlParameters } from '../store/sql';
import { z } from 'zod';
import { PHOTO_ROOT_VISIBLE, photoMembership } from './membership';
import { FILTER_SQL, PHOTO_FROM, PHOTO_SHOWN, visibility } from './timeline';
import type { MemoriesReader, MemoryContext } from './memories';

const COUNT_FIELD = z.number().int().nonnegative();

const LIBRARY_ROW = z.strictObject({
  timeline: COUNT_FIELD,
  favourites: COUNT_FIELD,
  videos: COUNT_FIELD,
  screenshots: COUNT_FIELD,
  places: COUNT_FIELD,
});

const ONE = z.strictObject({ total: COUNT_FIELD });

const SCREENSHOT_SQL = FILTER_SQL.screenshots.replace(/^ and /, '');

export class RailCountsReader {
  constructor(
    private readonly context: StoreContext,
    private readonly memories: MemoriesReader,
  ) {}

  read(actor: DriveActor, at: MemoryContext): PhotoRailCounts {
    const library = this.library(actor);
    return PHOTO_RAIL_COUNTS.parse({
      ...library,
      memories: this.memories.list(actor, at).length,
      albums: this.total(
        `select count(*) as total from drive_albums a
         where $owner = 1 or a.scope = 'home' or a.owner_profile_id = $profile`,
        visibility(actor),
      ),
      cameras: this.rootItems(actor, 'cameras'),
      ai: this.rootItems(actor, 'ai_images'),
      duplicates: actor.owner ? this.duplicates(actor) : null,
      backupPhones: this.total(
        'select count(*) as total from drive_backup_devices d where d.profile_id = $profile',
        { profile: actor.profileId },
      ),
      deleted: this.total(
        `select count(*) as total from drive_trash t join drive_roots r on r.id = t.root_id
         where t.is_folder = 0 and ${photoMembership('t.item_id')} and ${PHOTO_ROOT_VISIBLE}`,
        visibility(actor),
      ),
    });
  }

  private library(actor: DriveActor): z.output<typeof LIBRARY_ROW> {
    return (
      this.context.sql.get(
        LIBRARY_ROW,
        `select count(*) as timeline,
           coalesce(sum(i.starred = 1), 0) as favourites,
           coalesce(sum(i.kind = 'video'), 0) as videos,
           coalesce(sum(${SCREENSHOT_SQL}), 0) as screenshots,
           count(distinct m.place_id) as places
         from ${PHOTO_FROM} where ${PHOTO_SHOWN}`,
        visibility(actor),
      ) ?? { timeline: 0, favourites: 0, videos: 0, screenshots: 0, places: 0 }
    );
  }

  private rootItems(actor: DriveActor, kind: 'cameras' | 'ai_images'): number {
    return this.total(
      `select count(*) as total from drive_items i join drive_roots r on r.id = i.root_id
       where r.kind = '${kind}' and i.kind in ('image', 'video') and ${PHOTO_ROOT_VISIBLE}`,
      visibility(actor),
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
