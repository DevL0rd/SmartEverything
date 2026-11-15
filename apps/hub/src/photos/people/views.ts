import {
  ApiError,
  PHOTO_BOX,
  PHOTO_GROUP,
  type PhotoGroup,
  type PhotoGroupKind,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../../store/codec';
import type { StoreContext } from '../../store/context';
import type { PhotoGroupRow, PhotoGroupsRepository } from '../../store/repositories/photo-groups';
import { inList, type SqlParameters } from '../../store/sql';
import { itemsOf, VISIBLE_ITEM } from './rows';

const COUNT_ROW = z.strictObject({ group_id: z.string(), count: z.int().positive() });

const COVER_ROW = storedRow(
  z.strictObject({
    group_id: z.string(),
    face_id: z.string(),
    item_id: z.string(),
    box: PHOTO_BOX,
  }),
  { json: ['box'] },
);

interface GroupFilter {
  readonly text: string;
  readonly parameters: SqlParameters;
}

function groupFilter(groupIds: readonly string[] | undefined): GroupFilter {
  if (groupIds === undefined) return { text: '', parameters: {} };
  const filter = inList('gf.group_id', 'groupIds', groupIds);
  return { text: ` and ${filter.text}`, parameters: filter.parameters };
}

function rank(group: PhotoGroup): number {
  if (group.name !== null) return 0;
  return group.count > 1 ? 1 : 2;
}

export function ordered(groups: readonly PhotoGroup[]): PhotoGroup[] {
  return groups.toSorted(
    (a, b) => rank(a) - rank(b) || b.count - a.count || (a.id < b.id ? -1 : 1),
  );
}

export class GroupViews {
  constructor(
    private readonly context: StoreContext,
    private readonly groups: PhotoGroupsRepository,
  ) {}

  list(profileId: string, kind?: PhotoGroupKind, groupIds?: readonly string[]): PhotoGroup[] {
    const rows = this.groups
      .forProfile(profileId, kind)
      .filter((row) => groupIds === undefined || groupIds.includes(row.id));
    if (rows.length === 0) return [];
    const filter = groupFilter(groupIds);
    const counts = this.counts(profileId, filter);
    const covers = this.covers(profileId, filter);
    return ordered(
      rows.flatMap((row) => {
        const count = counts.get(row.id);
        const cover = covers.get(row.id);
        return count === undefined || cover === undefined ? [] : [viewOf(row, count, cover)];
      }),
    );
  }

  one(profileId: string, groupId: string): PhotoGroup {
    const [view] = this.list(profileId, undefined, [groupId]);
    if (view === undefined) throw new ApiError('not_found', 'There is no such person or pet.');
    return view;
  }

  private counts(profileId: string, filter: GroupFilter): Map<string, number> {
    return new Map(
      this.context.sql
        .all(
          COUNT_ROW,
          `select gf.group_id, count(distinct f.item_id) as count
            from photo_group_faces gf join photo_faces f on f.id = gf.face_id
              join ${itemsOf('f.item_id')}
            where gf.profile_id = $profile and gf.source <> 'rejected' and ${VISIBLE_ITEM}${filter.text}
            group by gf.group_id`,
          { profile: profileId, ...filter.parameters },
        )
        .map((row) => [row.group_id, row.count]),
    );
  }

  private covers(profileId: string, filter: GroupFilter): Map<string, z.output<typeof COVER_ROW>> {
    return new Map(
      this.context.sql
        .all(
          COVER_ROW,
          `select group_id, face_id, item_id, box from (
            select gf.group_id, f.id as face_id, f.item_id, f.box,
              row_number() over (partition by gf.group_id
                order by (f.id = g.cover_face_id) desc, f.quality desc, f.id) as place
            from photo_group_faces gf join photo_groups g on g.id = gf.group_id
              join photo_faces f on f.id = gf.face_id
              join ${itemsOf('f.item_id')}
            where g.profile_id = $profile and gf.profile_id = $profile
              and gf.source <> 'rejected' and ${VISIBLE_ITEM}${filter.text})
          where place = 1`,
          { profile: profileId, ...filter.parameters },
        )
        .map((row) => [row.group_id, row]),
    );
  }
}

function viewOf(row: PhotoGroupRow, count: number, cover: z.output<typeof COVER_ROW>): PhotoGroup {
  return PHOTO_GROUP.parse({
    id: row.id,
    kind: row.kind,
    name: row.name,
    species: row.species,
    linkedProfileId: row.linkedProfileId,
    coverFaceId: cover.face_id,
    coverItemId: cover.item_id,
    coverBox: cover.box,
    hidden: row.hidden,
    count,
    updatedAt: row.updatedAt,
  });
}
