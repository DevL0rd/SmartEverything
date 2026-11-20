import { z } from 'zod';
import type { StoreReader } from '../../store/reader';
import type { SqlFilter } from '../../store/sql';
import { librarySubjectScope } from './scope';
import type { PhotoAiKind } from './queue';

const CANDIDATE = z.strictObject({
  id: z.string(),
  rev: z.int().positive(),
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

export interface CandidateScope {
  readonly allowed: readonly string[];
  readonly homeOwner: string;
  readonly items: readonly string[] | null;
  readonly feedAfter: number | null;
  readonly feedUpTo: number;
}

function sourceOf(scope: CandidateScope): SqlFilter {
  const whole = 'drive_media m cross join drive_items i on i.id = m.item_id';
  if (scope.items === null) return { text: whole, parameters: {} };
  const named = 'select value as id from json_each($items)';
  const items = { items: JSON.stringify(scope.items) };
  const touched =
    scope.feedAfter === null
      ? named
      : `${named} union select item_id from drive_feed where seq > $feedAfter and seq <= $feedUpTo`;
  return {
    text: `(${touched}) s cross join drive_items i on i.id = s.id
      cross join drive_media m on m.item_id = i.id`,
    parameters:
      scope.feedAfter === null
        ? items
        : { ...items, feedAfter: scope.feedAfter, feedUpTo: scope.feedUpTo },
  };
}

export function candidatesOf(
  reader: Pick<StoreReader, 'all'>,
  kind: PhotoAiKind,
  scope: CandidateScope,
): Promise<Candidate[]> {
  const source = sourceOf(scope);
  return reader.all(
    CANDIDATE,
    `select i.id, i.rev
      from ${source.text}
        join drive_roots r on r.id = i.root_id
      where ${librarySubjectScope()} and ${READY} and ${EXTRA[kind]}
        and coalesce(r.owner_profile_id, $homeOwner) in (select value from json_each($allowed))
        and not exists (select 1 from drive_media_jobs j
          where j.item_id = i.id and j.rev = i.rev and j.kind = $kind)
      order by i.id`,
    {
      kind,
      allowed: JSON.stringify(scope.allowed),
      homeOwner: scope.homeOwner,
      ...source.parameters,
    },
  );
}
