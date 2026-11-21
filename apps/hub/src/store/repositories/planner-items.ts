import { PLANNER_ITEM_ROW, type PlannerItemRow } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, moment, type StoreContext } from '../context';
import { flag, inList, jsonText } from '../sql';
import { removeGuestsOfItems } from './planner-guests';
import type { PlannerOccurrencesRepository } from './planner-occurrences';

const STORED_ITEM = storedRow(PLANNER_ITEM_ROW, {
  flags: ['all_day'],
  json: ['tags', 'exdates', 'completion', 'attachments', 'reminders', 'google'],
});

const COLUMNS = `id, profile_id, collection_id, kind, parent_id, title, notes, location, priority,
  tags, estimate_minutes, start_local, end_local, time_zone, all_day, due_date, due_at, rrule,
  exdates, series_id, original_start, start, "end", series_end, status, position, completion,
  attachments, reminders, google, assignee_id, ical_uid, ical_sequence, booking_page_id, created_by, created_at,
  updated_at, deleted_at`;

const LIVE = 'deleted_at is null';

const MASTER = 'coalesce(planner_items.series_id, planner_items.id)';

const INVOLVED = `(assignee_id = $profileId
  or exists (select 1 from planner_items parent
    where parent.id = planner_items.parent_id and parent.assignee_id = $profileId)
  or exists (select 1 from planner_guests guest
    where guest.profile_id = $profileId and guest.item_id = ${MASTER}))`;

const VISIBLE = `(profile_id = $profileId
  or collection_id in (select collection_id from planner_collection_shares where profile_id = $profileId)
  or collection_id in (select id from planner_collections where audience = 'household')
  or ${INVOLVED})`;

const NOT_DECLINED = `not exists (select 1 from planner_guests declined
  where declined.profile_id = $profileId and declined.response = 'no' and declined.item_id = ${MASTER})`;

const NOT_OTHERS_TASK = `(kind = 'event' or assignee_id is null or assignee_id = $profileId
  or profile_id = $profileId)`;

const SCOPES = {
  owned: 'profile_id = $profileId',
  visible: VISIBLE,
  shown: `${VISIBLE} and ${NOT_DECLINED} and ${NOT_OTHERS_TASK}`,
  involved: `(profile_id = $profileId or ${INVOLVED}) and ${NOT_DECLINED}`,
} as const;

export type PlannerItemScope = keyof typeof SCOPES;

const REMOVED_ID = z.object({ id: z.string() });

const GUEST_PROFILE = z.object({ profile_id: z.string() });

export type PlannerItemInput = Omit<
  PlannerItemRow,
  'id' | 'created_at' | 'updated_at' | 'deleted_at'
> & { readonly id?: string };

type PlannerItemPatchFields = Omit<
  PlannerItemRow,
  'id' | 'profile_id' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export type PlannerItemPatch = {
  readonly [K in keyof PlannerItemPatchFields]?: PlannerItemPatchFields[K] | undefined;
};

export interface PlannerItemFilter {
  readonly collectionIds?: readonly string[] | undefined;
  readonly kind?: PlannerItemRow['kind'] | undefined;
  readonly statuses?: readonly PlannerItemRow['status'][] | undefined;
  readonly completion?: PlannerItemRow['completion']['kind'] | undefined;
  readonly scope?: PlannerItemScope | undefined;
}

export interface PlannerInstantWindow {
  readonly from: string;
  readonly to: string;
}

function parameters(row: PlannerItemRow): Record<string, SQLInputValue> {
  return {
    ...row,
    all_day: flag(row.all_day),
    tags: jsonText(row.tags),
    exdates: jsonText(row.exdates),
    completion: jsonText(row.completion),
    attachments: jsonText(row.attachments),
    reminders: jsonText(row.reminders),
    google: row.google === null ? null : jsonText(row.google),
  };
}

function filterClauses(filter: PlannerItemFilter): {
  readonly text: string;
  readonly parameters: Record<string, SQLInputValue>;
} {
  const clauses: string[] = [];
  const values: Record<string, SQLInputValue> = {};
  if (filter.collectionIds !== undefined) {
    const list = inList('collection_id', 'collections', filter.collectionIds);
    clauses.push(list.text);
    Object.assign(values, list.parameters);
  }
  if (filter.statuses !== undefined) {
    const list = inList('status', 'statuses', filter.statuses);
    clauses.push(list.text);
    Object.assign(values, list.parameters);
  }
  if (filter.kind !== undefined) {
    clauses.push('kind = $kind');
    values['kind'] = filter.kind;
  }
  if (filter.completion !== undefined) {
    clauses.push("json_extract(completion, '$.kind') = $completionKind");
    values['completionKind'] = filter.completion;
  }
  return { text: clauses.map((clause) => ` and ${clause}`).join(''), parameters: values };
}

export class PlannerItemsRepository {
  constructor(
    private readonly context: StoreContext,
    private readonly occurrences: PlannerOccurrencesRepository,
  ) {}

  findAny(id: string): PlannerItemRow | undefined {
    return this.context.sql.get(
      STORED_ITEM,
      `select ${COLUMNS} from planner_items where id = $id and ${LIVE}`,
      { id },
    );
  }

  anyById(id: string): PlannerItemRow {
    return found(this.findAny(id), 'planner item', id);
  }

  byIcalUid(collectionId: string, icalUid: string): PlannerItemRow | undefined {
    return this.context.sql.get(
      STORED_ITEM,
      `select ${COLUMNS} from planner_items
       where collection_id = $collectionId and ical_uid = $icalUid and series_id is null`,
      { collectionId, icalUid },
    );
  }

  inCollection(collectionId: string): PlannerItemRow[] {
    return this.context.sql.all(
      STORED_ITEM,
      `select ${COLUMNS} from planner_items
       where collection_id = $collectionId and ${LIVE} order by position, id`,
      { collectionId },
    );
  }

  assignedTo(profileId: string): PlannerItemRow[] {
    return this.context.sql.all(
      STORED_ITEM,
      `select ${COLUMNS} from planner_items
       where assignee_id = $profileId and ${LIVE} order by collection_id, position, id`,
      { profileId },
    );
  }

  find(id: string, profileId: string): PlannerItemRow | undefined {
    return this.context.sql.get(
      STORED_ITEM,
      `select ${COLUMNS} from planner_items where id = $id and profile_id = $profileId and ${LIVE}`,
      { id, profileId },
    );
  }

  byId(id: string, profileId: string): PlannerItemRow {
    return found(this.find(id, profileId), 'planner item', id);
  }

  list(profileId: string, filter: PlannerItemFilter = {}): PlannerItemRow[] {
    const clauses = filterClauses(filter);
    return this.context.sql.all(
      STORED_ITEM,
      `select ${COLUMNS} from planner_items
       where ${SCOPES[filter.scope ?? 'owned']} and ${LIVE}${clauses.text}
       order by collection_id, position, id`,
      { profileId, ...clauses.parameters },
    );
  }

  range(
    profileId: string,
    window: PlannerInstantWindow,
    scope: PlannerItemScope = 'owned',
  ): PlannerItemRow[] {
    return this.context.sql.all(
      STORED_ITEM,
      `select ${COLUMNS} from planner_items
       where ${SCOPES[scope]} and ${LIVE}
         and ((rrule is null and start is not null and start < $to and coalesce("end", start) >= $from)
           or (rrule is not null and start <= $to and (series_end is null or series_end >= $from)))
       order by start, id`,
      { profileId, from: moment(window.from), to: moment(window.to) },
    );
  }

  due(
    profileId: string,
    window: PlannerInstantWindow,
    scope: PlannerItemScope = 'owned',
  ): PlannerItemRow[] {
    return this.context.sql.all(
      STORED_ITEM,
      `select ${COLUMNS} from planner_items
       where ${SCOPES[scope]} and ${LIVE} and due_at >= $from and due_at < $to
       order by due_at, id`,
      { profileId, from: moment(window.from), to: moment(window.to) },
    );
  }

  children(parentId: string, profileId: string): PlannerItemRow[] {
    return this.context.sql.all(
      STORED_ITEM,
      `select ${COLUMNS} from planner_items
       where parent_id = $parentId and profile_id = $profileId and ${LIVE} order by position, id`,
      { parentId, profileId },
    );
  }

  overrides(seriesId: string, profileId: string): PlannerItemRow[] {
    return this.context.sql.all(
      STORED_ITEM,
      `select ${COLUMNS} from planner_items
       where series_id = $seriesId and profile_id = $profileId and ${LIVE} order by original_start, id`,
      { seriesId, profileId },
    );
  }

  byGoogle(profileId: string, calendarOrListId: string, googleId: string): PlannerItemRow[] {
    return this.context.sql.all(
      STORED_ITEM,
      `select ${COLUMNS} from planner_items
       where profile_id = $profileId and google is not null
         and json_extract(google, '$.calendarOrListId') = $calendarOrListId
         and json_extract(google, '$.id') = $googleId
       order by series_id is not null, id`,
      { profileId, calendarOrListId, googleId },
    );
  }

  trashed(profileId: string): PlannerItemRow[] {
    return this.context.sql.all(
      STORED_ITEM,
      `select ${COLUMNS} from planner_items
       where profile_id = $profileId and deleted_at is not null order by deleted_at, id`,
      { profileId },
    );
  }

  insert(input: PlannerItemInput): PlannerItemRow {
    return this.context.write(() => {
      const now = this.context.now();
      const row = PLANNER_ITEM_ROW.parse({
        ...input,
        id: input.id ?? this.context.newId(),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
      this.write('add the planner item', row);
      this.context.changed('planner_items', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, profileId: string, patch: PlannerItemPatch): PlannerItemRow {
    return this.context.write(() => {
      const before = this.byId(id, profileId);
      const after = PLANNER_ITEM_ROW.parse({
        ...before,
        ...patch,
        updated_at: this.context.now(),
      });
      const set = assignments(parameters(after));
      this.context.sql.run(
        'change the planner item',
        `update planner_items set ${set.text} where id = $id`,
        set.parameters,
      );
      this.context.changed('planner_items', 'UPDATE', after, before);
      return after;
    });
  }

  trash(id: string, profileId: string): PlannerItemRow {
    return this.context.write(() => {
      const before = this.byId(id, profileId);
      const now = this.context.now();
      const after = PLANNER_ITEM_ROW.parse({ ...before, deleted_at: now, updated_at: now });
      this.context.sql.run(
        'trash the planner item',
        'update planner_items set deleted_at = $now, updated_at = $now where id = $id',
        { id, now },
      );
      this.context.changed('planner_items', 'UPDATE', after, before);
      return after;
    });
  }

  purge(id: string, profileId: string): void {
    this.context.write(() => {
      const root = found(
        this.context.sql.get(
          REMOVED_ID,
          'select id from planner_items where id = $id and profile_id = $profileId',
          { id, profileId },
        ),
        'planner item',
        id,
      );
      this.purgeTree(root.id);
    });
  }

  purgeCollection(collectionId: string): void {
    this.context.write(() => {
      const roots = this.context.sql.all(
        REMOVED_ID,
        'select id from planner_items where collection_id = $collectionId',
        { collectionId },
      );
      for (const root of roots) this.purgeTree(root.id);
    });
  }

  private purgeTree(rootId: string): void {
    const ids = this.context.sql
      .all(
        REMOVED_ID,
        `with recursive tree(id) as (
           select id from planner_items where id = $rootId
           union
           select i.id from planner_items i join tree t on i.parent_id = t.id or i.series_id = t.id
         ) select id from tree`,
        { rootId },
      )
      .map((row) => row.id);
    if (ids.length === 0) return;
    const rows = this.context.sql.all(
      STORED_ITEM,
      `select ${COLUMNS} from planner_items where ${inList('id', 'ids', ids).text}`,
      { ids: jsonText(ids) },
    );
    const guests = this.guestProfiles(ids);
    this.occurrences.removeForItems(ids);
    removeGuestsOfItems(this.context, ids);
    this.context.sql.run(
      'remove the planner item',
      'delete from planner_items where id = $rootId',
      { rootId },
    );
    for (const row of rows) {
      this.context.changedWithSequence('planner_items', 'DELETE', {
        record: null,
        oldRecord: row,
        guests,
      });
    }
  }

  private guestProfiles(itemIds: readonly string[]): string[] {
    const items = inList('item_id', 'ids', itemIds);
    return this.context.sql
      .all(
        GUEST_PROFILE,
        `select distinct profile_id from planner_guests
         where profile_id is not null and ${items.text}`,
        items.parameters,
      )
      .map((row) => row.profile_id);
  }

  private write(operation: string, row: PlannerItemRow): void {
    const values = parameters(row);
    const columns = Object.keys(values);
    this.context.sql.run(
      operation,
      `insert into planner_items (${columns.join(', ')})
       values (${columns.map((column) => `$${column}`).join(', ')})`,
      values,
    );
  }
}
