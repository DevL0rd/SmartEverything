import type { PhotoGroupKind } from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../../store/context';
import { float32Of } from '../ai/vectors';
import { PHOTO_VISIBLE } from '../membership';

const FACE_ROW = z.strictObject({
  id: z.string(),
  species: z.string().nullable(),
  model: z.string(),
  quality: z.number(),
  vector: z.instanceof(Uint8Array),
  group_id: z.string().nullable(),
  source: z.enum(['auto', 'confirmed']).nullable(),
});

const REJECTION = z.strictObject({ face_id: z.string(), group_id: z.string() });

export interface VisibleFace {
  readonly id: string;
  readonly species: string | null;
  readonly model: string;
  readonly quality: number;
  readonly embedding: Float32Array;
  readonly groupId: string | null;
  readonly confirmed: boolean;
}

export function itemsOf(column: string): string {
  return `drive_items i on i.id = ${column} join drive_roots r on r.id = i.root_id`;
}

export const VISIBLE_ITEM = `i.kind in ('image', 'video') and ${PHOTO_VISIBLE}`;

const VISIBLE_FACES = `select f.id, f.species, f.model, f.quality, f.vector,
    (select gf.group_id from photo_group_faces gf
      where gf.profile_id = $profile and gf.face_id = f.id and gf.source <> 'rejected') as group_id,
    (select gf.source from photo_group_faces gf
      where gf.profile_id = $profile and gf.face_id = f.id and gf.source <> 'rejected') as source
  from photo_faces f join ${itemsOf('f.item_id')}
  where f.kind = $kind and ${VISIBLE_ITEM}
  order by f.quality desc, f.id`;

export class PeopleRows {
  constructor(private readonly context: StoreContext) {}

  visibleFaces(profileId: string, kind: PhotoGroupKind): VisibleFace[] {
    return this.context.sql
      .all(FACE_ROW, VISIBLE_FACES, { profile: profileId, kind })
      .map((row) => ({
        id: row.id,
        species: row.species,
        model: row.model,
        quality: row.quality,
        embedding: float32Of(row.vector),
        groupId: row.group_id,
        confirmed: row.source === 'confirmed',
      }));
  }

  hasUnassigned(profileId: string, kind: PhotoGroupKind): boolean {
    return (
      this.context.sql.get(
        z.strictObject({ found: z.int() }),
        `select 1 as found from photo_faces f join ${itemsOf('f.item_id')}
          where f.kind = $kind and ${VISIBLE_ITEM}
            and not exists (select 1 from photo_group_faces gf
              where gf.profile_id = $profile and gf.face_id = f.id and gf.source <> 'rejected')
          limit 1`,
        { profile: profileId, kind },
      ) !== undefined
    );
  }

  rejections(profileId: string): Map<string, Set<string>> {
    const rejected = new Map<string, Set<string>>();
    const rows = this.context.sql.all(
      REJECTION,
      `select face_id, group_id from photo_group_faces
        where profile_id = $profile and source = 'rejected'`,
      { profile: profileId },
    );
    for (const row of rows) {
      const groups = rejected.get(row.face_id) ?? new Set<string>();
      groups.add(row.group_id);
      rejected.set(row.face_id, groups);
    }
    return rejected;
  }
}
