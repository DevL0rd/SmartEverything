import { DRIVE_SUGGESTION, DRIVE_SUGGESTION_REASONS } from '@smarteverything/domain';
import { z } from 'zod';
import type { HostStore } from '../../store/host/host-store';
import { storeUnit } from '../../store/host/unit';
import { accessSql, type DriveActor } from '../access';
import { encodeCursor } from '../search';
import { DRIVE_PAGE_SIZE } from '../page-size';
import type { SuggestionCursor, SuggestionPage } from '../social/suggestions';

const SIGNAL = z.strictObject({
  item_id: z.string(),
  at: z.string(),
  reason: z.enum(DRIVE_SUGGESTION_REASONS),
  actor: z.string().nullable(),
});

const SIGNALS = `
  select o.item_id as item_id, o.opened_at as at, 'opened' as reason, null as actor, 1 as rank
    from drive_opens o where o.profile_id = $profile
  union all
  select f.item_id, f.at,
    case when f.actor_profile_id = $profile then 'edited' else 'edited_by' end,
    f.actor_profile_id, 2
    from drive_feed f
    where f.op = 'update' and f.actor_profile_id is not null
      and (f.actor_profile_id = $profile
        or exists (select 1 from drive_roots fr where fr.id = f.root_id and fr.scope <> 'home'))
  union all
  select g.item_id, g.created_at, 'shared', g.granted_by, 3
    from drive_grants g where g.profile_id = $profile
  union all
  select n.item_id, n.updated_at, case n.kind when 'mentioned' then 'mentioned' else 'commented' end,
    n.actor_profile_id, 4
    from drive_notifications n
    where n.profile_id = $profile and n.kind in ('commented', 'replied', 'mentioned')`;

function suggestions(
  store: Pick<HostStore, 'context' | 'driveItems'>,
  { actor, after }: { readonly actor: DriveActor; readonly after: SuggestionCursor | null },
): SuggestionPage {
  const rows = store.context.sql.all(
    SIGNAL,
    `select n.item_id, n.at, n.reason, n.actor
      from (select s.*, row_number() over (partition by s.item_id order by s.at desc, s.rank desc) as place
        from (${SIGNALS}) s) n
      join drive_items i on i.id = n.item_id
      join drive_roots r on r.id = i.root_id
      where n.place = 1 and ${accessSql('i', 'r')}
        ${after === null ? '' : 'and (n.at, n.item_id) < ($afterAt, $afterId)'}
      order by n.at desc, n.item_id desc limit $limit`,
    {
      profile: actor.profileId,
      limit: DRIVE_PAGE_SIZE + 1,
      ...(after === null ? {} : { afterAt: after.at, afterId: after.itemId }),
    },
  );
  const shown = rows.slice(0, DRIVE_PAGE_SIZE);
  const last = shown.at(-1);
  return {
    items: shown.map((row) =>
      DRIVE_SUGGESTION.parse({
        reason: row.reason,
        at: row.at,
        item: store.driveItems.byId(row.item_id, actor.profileId),
        ...(row.actor === null || row.reason === 'opened' || row.reason === 'edited'
          ? {}
          : { actorProfileId: row.actor }),
      }),
    ),
    next:
      rows.length > DRIVE_PAGE_SIZE && last !== undefined
        ? encodeCursor({ at: last.at, itemId: last.item_id })
        : null,
  };
}

export const DRIVE_SUGGESTIONS_UNIT = storeUnit(suggestions);
