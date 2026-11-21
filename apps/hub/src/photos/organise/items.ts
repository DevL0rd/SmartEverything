import { ApiError } from '@smarteverything/domain';
import { z } from 'zod';
import { driveSql, type DriveActor } from '../../drive/access';
import type { StoreContext } from '../../store/context';
import type { HostStore } from '../../store/host/host-store';
import { inList } from '../../store/sql';
import { PHOTO_VISIBLE } from '../membership';

export interface ItemsChanged {
  readonly count: number;
}

export interface VisibleItem {
  readonly id: string;
  readonly rootId: string;
  readonly takenAt: string | null;
  readonly tzOffsetMin: number | null;
  readonly own: boolean;
}

const ROW = z.strictObject({
  id: z.string(),
  root_id: z.string(),
  taken_at: z.string().nullable(),
  tz_offset_min: z.number().nullable(),
  own: z.number(),
});

export function visibleItems(
  context: StoreContext,
  actor: DriveActor,
  itemIds: readonly string[],
): readonly VisibleItem[] {
  const unique = [...new Set(itemIds)];
  const filter = inList('i.id', 'ids', unique);
  const items = context.sql
    .all(
      ROW,
      `select i.id, i.root_id, i.taken_at, m.tz_offset_min, ${driveSql('r')} as own
        from drive_items i join drive_roots r on r.id = i.root_id
          left join drive_media m on m.item_id = i.id
        where i.kind in ('image', 'video') and ${PHOTO_VISIBLE} and ${filter.text}
        order by i.id`,
      { profile: actor.profileId, ...filter.parameters },
    )
    .map((row): VisibleItem => ({
      id: row.id,
      rootId: row.root_id,
      takenAt: row.taken_at,
      tzOffsetMin: row.tz_offset_min,
      own: row.own === 1,
    }));
  if (items.length !== unique.length) {
    throw new ApiError(
      'not_found',
      `${String(unique.length - items.length)} of the photos are not in your photos.`,
    );
  }
  return items;
}

export type AnnounceStore = Pick<HostStore, 'feed' | 'driveFeed'>;

export function announceItems(
  store: AnnounceStore,
  items: readonly VisibleItem[],
  moments: readonly (string | null)[] = [],
): void {
  const months = new Set<string>();
  for (const moment of [...items.map((item) => item.takenAt), ...moments]) {
    if (moment !== null) months.add(new Date(moment).toISOString().slice(0, 7));
  }
  store.feed.notice({
    type: 'drive_changed',
    rootIds: [...new Set(items.map((item) => item.rootId))].sort(),
    folderIds: [],
    albumIds: [],
    months: [...months].sort(),
    cursor: store.driveFeed.latestSeq(),
  });
}
