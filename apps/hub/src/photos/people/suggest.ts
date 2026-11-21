import { PHOTO_SUGGESTIONS, type PhotoGroup, type PhotoSuggestions } from '@smarteverything/domain';
import { z } from 'zod';
import { driveMatchOf } from '../../drive/search';
import type { DriveActor } from '../../drive/access';
import type { StoreContext } from '../../store/context';
import type { PhotoGroupsRepository } from '../../store/repositories/photo-groups';
import { itemsOf, VISIBLE_ITEM } from './rows';
import { GroupViews } from './views';

export const SUGGESTION_ROWS = 8;

const THING_ROW = z.strictObject({ label: z.string(), count: z.int().positive() });

const TEXT_ROW = z.strictObject({ item_id: z.string(), snippet: z.string().min(1) });

const SNIPPET_TOKENS = 12;

function escaped(text: string): string {
  return text.replace(/[\\%_]/gu, (char) => `\\${char}`);
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];
}

function startsLike(name: string, words: readonly string[]): boolean {
  const own = wordsOf(name);
  return words.every((word) => own.some((candidate) => candidate.startsWith(word)));
}

export class PhotoSuggest {
  private readonly views: GroupViews;

  constructor(
    private readonly context: StoreContext,
    private readonly groups: PhotoGroupsRepository,
  ) {
    this.views = new GroupViews(context, groups);
  }

  read(actor: DriveActor, query: string): PhotoSuggestions {
    const words = wordsOf(query);
    const groups = this.groupsFor(actor, words);
    return PHOTO_SUGGESTIONS.parse({
      people: groups.filter((group) => group.kind === 'person').map(suggestedGroup),
      pets: groups.filter((group) => group.kind === 'pet').map(suggestedGroup),
      things: this.things(actor, query),
      text: this.text(actor, query),
    });
  }

  private groupsFor(actor: DriveActor, words: readonly string[]): PhotoGroup[] {
    if (words.length === 0) return [];
    const ids = this.groups
      .forProfile(actor.profileId)
      .filter((group) => !group.hidden && group.name !== null && startsLike(group.name, words))
      .map((group) => group.id);
    return ids.length === 0 ? [] : this.views.list(actor.profileId, undefined, ids);
  }

  private things(actor: DriveActor, query: string): z.output<typeof THING_ROW>[] {
    const trimmed = query.trim().toLowerCase();
    return this.context.sql.all(
      THING_ROW,
      `select lower(l.value) as label, count(distinct a.item_id) as count
        from photo_analysis a join ${itemsOf('a.item_id')}, json_each(a.labels) l
        where a.state = 'done' and a.rev = i.rev and ${VISIBLE_ITEM}
          and (lower(l.value) like $start escape '\\' or lower(l.value) like $inner escape '\\')
        group by label order by count desc, label limit $rows`,
      {
        profile: actor.profileId,
        start: `${escaped(trimmed)}%`,
        inner: `% ${escaped(trimmed)}%`,
        rows: SUGGESTION_ROWS,
      },
    );
  }

  private text(actor: DriveActor, query: string): { itemId: string; snippet: string }[] {
    const match = driveMatchOf(query);
    if (match === null) return [];
    return this.context.sql
      .all(
        TEXT_ROW,
        `select drive_item_text_search.item_id as item_id,
            snippet(drive_item_text_search, 1, '', '', '…', ${String(SNIPPET_TOKENS)}) as snippet
          from drive_item_text_search
            join ${itemsOf('drive_item_text_search.item_id')}
          where drive_item_text_search match $match and ${VISIBLE_ITEM}
          order by i.taken_at desc, i.id limit $rows`,
        { profile: actor.profileId, match, rows: SUGGESTION_ROWS },
      )
      .map((row) => ({ itemId: row.item_id, snippet: row.snippet }));
  }
}

function suggestedGroup(group: PhotoGroup): {
  groupId: string;
  name: string;
  coverFaceId: string;
  coverItemId: string;
  count: number;
} {
  return {
    groupId: group.id,
    name: group.name ?? '',
    coverFaceId: group.coverFaceId,
    coverItemId: group.coverItemId,
    count: group.count,
  };
}
