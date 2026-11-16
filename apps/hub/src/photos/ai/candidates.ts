import { z } from 'zod';
import type { StoreContext } from '../../store/context';
import { librarySubjectScope } from './scope';
import type { PhotoAiKind } from './queue';

const CANDIDATE = z.strictObject({
  id: z.string(),
  rev: z.int().positive(),
  owner: z.string().nullable(),
});

export type Candidate = z.output<typeof CANDIDATE>;

const READY = `(i.kind = 'image' and m.preview_state = 'ready' or i.kind = 'video' and m.poster_state = 'ready')`;

const ANALYSED = `exists (select 1 from photo_analysis a
  where a.item_id = i.id and a.rev = i.rev and a.state = 'done'`;

const VISION_PENDING = `not exists (select 1 from drive_media_jobs v
  where v.item_id = i.id and v.rev = i.rev and v.kind = 'vision' and v.state in ('queued', 'running'))`;

const EXTRA: Readonly<Record<PhotoAiKind, string>> = {
  faces: '1 = 1',
  vision: `(i.kind = 'image' or m.playable_state <> 'none')`,
  embed: `${ANALYSED}) and ${VISION_PENDING}`,
  pet_embed: `${ANALYSED} and json_array_length(a.pets) > 0) and ${VISION_PENDING}`,
};

export function candidatesOf(context: StoreContext, kind: PhotoAiKind): Candidate[] {
  return context.sql.all(
    CANDIDATE,
    `select i.id, i.rev, r.owner_profile_id as owner
      from drive_media m cross join drive_items i on i.id = m.item_id
        join drive_roots r on r.id = i.root_id
      where ${librarySubjectScope()} and ${READY} and ${EXTRA[kind]}
        and not exists (select 1 from drive_media_jobs j
          where j.item_id = i.id and j.rev = i.rev and j.kind = $kind)
      order by i.id`,
    { kind },
  );
}
