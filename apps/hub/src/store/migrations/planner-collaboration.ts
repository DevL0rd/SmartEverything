import type { LogPayload } from '@smarteverything/logging';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Sql } from '../sql';
import type { Migration } from './migration';

const JSON_OBJECT = (column: string): string =>
  `check (json_valid(${column}) and json_type(${column}) = 'object')`;

const JSON_ARRAY = (column: string): string =>
  `check (json_valid(${column}) and json_type(${column}) = 'array')`;

const FLAG = (column: string): string => `check (${column} in (0, 1))`;

const COLOURS = `'work', 'family', 'personal', 'health', 'home', 'shopping'`;

const COLLECTION_COLUMNS = `id, profile_id, kind, name, colour, icon, position, visible,
  default_reminders, source, google, created_at, updated_at`;

const ITEM_COLUMNS = `id, profile_id, collection_id, kind, parent_id, title, notes, location,
  priority, tags, estimate_minutes, start_local, end_local, time_zone, all_day, due_date, due_at,
  rrule, exdates, series_id, original_start, start, "end", series_end, status, position,
  completion, attachments, reminders, google, created_by, created_at, updated_at, deleted_at`;

const ITEM_INDEXES = [
  'create index planner_items_by_start on planner_items (profile_id, start)',
  'create index planner_items_by_due on planner_items (profile_id, due_at)',
  'create index planner_items_by_status on planner_items (profile_id, status)',
  'create index planner_items_by_series_end on planner_items (profile_id, series_end)',
  'create index planner_items_by_series on planner_items (series_id) where series_id is not null',
  'create index planner_items_by_parent on planner_items (parent_id) where parent_id is not null',
  'create index planner_items_by_collection on planner_items (collection_id, position)',
  `create index planner_items_by_google on planner_items (
    profile_id,
    (json_extract(google, '$.calendarOrListId')),
    (json_extract(google, '$.id'))
  ) where google is not null`,
  'create index planner_items_by_assignee on planner_items (assignee_id) where assignee_id is not null',
  `create unique index planner_items_by_ical_uid on planner_items (collection_id, ical_uid)
    where ical_uid is not null and series_id is null`,
];

const COLLECTIONS_REBUILD = [
  `create table planner_collections_next (
    id text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    kind text not null check (kind in ('calendar', 'list')),
    name text not null check (length(trim(name)) > 0),
    colour text not null check (colour in (${COLOURS})),
    icon text not null check (length(trim(icon)) > 0),
    position real not null,
    visible integer not null ${FLAG('visible')},
    default_reminders text not null ${JSON_ARRAY('default_reminders')},
    audience text not null check (audience in ('personal', 'household')),
    source text not null check (source in ('local', 'google', 'feed')),
    google text ${JSON_OBJECT('google')},
    feed text ${JSON_OBJECT('feed')},
    created_at text not null,
    updated_at text not null,
    check ((source = 'google') = (google is not null)),
    check ((source = 'feed') = (feed is not null)),
    check (source <> 'feed' or kind = 'calendar')
  ) strict`,
  `insert into planner_collections_next (${COLLECTION_COLUMNS}, audience, feed)
   select ${COLLECTION_COLUMNS}, 'personal', null from planner_collections`,
  'drop table planner_collections',
  'alter table planner_collections_next rename to planner_collections',
  'create index planner_collections_by_profile on planner_collections (profile_id, kind, position)',
  `create index planner_collections_by_household on planner_collections (audience)
    where audience = 'household'`,
];

const ITEMS_REBUILD = [
  `create table planner_items_next (
    id text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    collection_id text not null references planner_collections (id) on delete cascade,
    kind text not null check (kind in ('task', 'event')),
    parent_id text references planner_items (id) on delete cascade,
    title text not null check (length(trim(title)) > 0),
    notes text not null,
    location text,
    priority integer check (priority between 1 and 3),
    tags text not null ${JSON_ARRAY('tags')},
    estimate_minutes integer check (estimate_minutes > 0),
    start_local text,
    end_local text,
    time_zone text,
    all_day integer not null ${FLAG('all_day')},
    due_date text,
    due_at text,
    rrule text,
    exdates text not null ${JSON_ARRAY('exdates')},
    series_id text references planner_items (id) on delete cascade,
    original_start text,
    start text,
    end text,
    series_end text,
    status text not null check (status in ('open', 'done', 'cancelled', 'proposed')),
    position real not null,
    completion text not null ${JSON_OBJECT('completion')},
    attachments text not null ${JSON_ARRAY('attachments')},
    reminders text not null ${JSON_ARRAY('reminders')},
    google text ${JSON_OBJECT('google')},
    assignee_id text references profiles (id) on delete set null,
    ical_uid text check (ical_uid is null or length(ical_uid) > 0),
    ical_sequence integer not null check (ical_sequence >= 0),
    created_by text not null check (created_by in ('person', 'ai', 'google', 'automation', 'booking', 'feed')),
    created_at text not null,
    updated_at text not null,
    deleted_at text,
    check ((series_id is null) = (original_start is null)),
    check (assignee_id is null or kind = 'task')
  ) strict`,
  `insert into planner_items_next (${ITEM_COLUMNS}, assignee_id, ical_uid, ical_sequence)
   select ${ITEM_COLUMNS}, null, null, 0 from planner_items`,
  'drop table planner_items',
  'alter table planner_items_next rename to planner_items',
  ...ITEM_INDEXES,
];

const NEW_TABLES = [
  `create table planner_collection_shares (
    collection_id text not null references planner_collections (id) on delete cascade,
    profile_id text not null references profiles (id) on delete cascade,
    role text not null check (role in ('view', 'edit')),
    colour text check (colour is null or colour in (${COLOURS})),
    visible integer not null ${FLAG('visible')},
    created_at text not null,
    primary key (collection_id, profile_id)
  ) strict`,
  'create index planner_collection_shares_by_profile on planner_collection_shares (profile_id)',
  `create table planner_guests (
    id text primary key,
    item_id text not null references planner_items (id) on delete cascade,
    kind text not null check (kind in ('person', 'email')),
    profile_id text references profiles (id) on delete cascade,
    email text check (email is null or length(email) > 0),
    name text check (name is null or length(trim(name)) > 0),
    token_hash text check (token_hash is null or length(token_hash) = 64),
    response text not null check (response in ('needs_action', 'yes', 'no', 'maybe')),
    note text check (note is null or length(note) > 0),
    delivery text not null check (delivery in ('not_sent', 'sent', 'failed', 'link_only', 'google')),
    delivery_detail text check (delivery_detail is null or length(delivery_detail) > 0),
    invited_at text not null,
    responded_at text,
    check ((kind = 'person') = (profile_id is not null)),
    check ((kind = 'email') = (email is not null)),
    check ((kind = 'email') = (token_hash is not null)),
    check (kind = 'email' or delivery = 'not_sent'),
    check ((delivery = 'failed') = (delivery_detail is not null)),
    check ((response = 'needs_action') = (responded_at is null)),
    check (response <> 'needs_action' or note is null)
  ) strict`,
  'create index planner_guests_by_item on planner_guests (item_id)',
  'create index planner_guests_by_profile on planner_guests (profile_id) where profile_id is not null',
  'create unique index planner_guests_by_token on planner_guests (token_hash) where token_hash is not null',
  `create unique index planner_guests_one_person on planner_guests (item_id, profile_id)
    where profile_id is not null`,
  `create unique index planner_guests_one_email on planner_guests (item_id, lower(email))
    where email is not null`,
  `create table planner_export_links (
    collection_id text primary key references planner_collections (id) on delete cascade,
    token text not null unique check (length(token) = 43),
    created_at text not null
  ) strict`,
  `create table planner_booking_pages (
    id text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    collection_id text not null references planner_collections (id) on delete cascade,
    title text not null check (length(trim(title)) > 0),
    description text not null,
    minutes integer not null check (minutes > 0),
    availability text not null ${JSON_ARRAY('availability')},
    buffer_before integer not null check (buffer_before >= 0),
    buffer_after integer not null check (buffer_after >= 0),
    notice_minutes integer not null check (notice_minutes >= 0),
    ahead_days integer not null check (ahead_days > 0),
    location text check (location is null or length(trim(location)) > 0),
    enabled integer not null ${FLAG('enabled')},
    token text not null unique check (length(token) = 43),
    created_at text not null,
    updated_at text not null
  ) strict`,
  'create index planner_booking_pages_by_profile on planner_booking_pages (profile_id)',
  'create index planner_booking_pages_by_collection on planner_booking_pages (collection_id)',
  `create table mail_log (
    id text primary key,
    kind text not null check (kind in ('invite', 'update', 'cancel', 'booking_confirmation', 'test')),
    to_hash text not null check (length(to_hash) = 64),
    subject text not null check (length(subject) > 0),
    outcome text not null check (outcome in ('sent', 'failed')),
    detail text check (detail is null or length(detail) > 0),
    at text not null,
    check ((outcome = 'failed') = (detail is not null))
  ) strict`,
  'create index mail_log_by_time on mail_log (at)',
];

const OWNER = z.object({ id: z.string() });

const HAS_FAMILY = z.object({ total: z.number() });

const NEXT_POSITION = z.object({ position: z.number() });

function addFamilyCalendar(sql: Sql, now: string): LogPayload {
  const family = sql.get(
    HAS_FAMILY,
    "select count(*) as total from planner_collections where audience = 'household'",
  );
  if ((family?.total ?? 0) > 0) return { created: 0 };
  const owner = sql.get(
    OWNER,
    `select p.id from profiles p join person_access a on a.profile_id = p.id
     where a.role = 'owner' order by p.position, p.created_at, p.id limit 1`,
  );
  if (owner === undefined) return { created: 0 };
  const next = sql.get(
    NEXT_POSITION,
    `select coalesce(max(position), 0) + 1 as position from planner_collections
     where profile_id = $profileId and kind = 'calendar'`,
    { profileId: owner.id },
  );
  sql.run(
    'create the Family calendar',
    `insert into planner_collections
       (id, profile_id, kind, name, colour, icon, position, visible, default_reminders,
        audience, source, google, feed, created_at, updated_at)
     values ($id, $profileId, 'calendar', 'Family', 'family', 'users', $position, 1, '[]',
        'household', 'local', null, null, $now, $now)`,
    { id: randomUUID(), profileId: owner.id, position: next?.position ?? 1, now },
  );
  return { created: 1 };
}

export const PLANNER_COLLABORATION_MIGRATION: Migration = {
  version: 208,
  name: 'planner-collaboration',
  foreignKeys: 'off',
  statements: [...COLLECTIONS_REBUILD, ...ITEMS_REBUILD, ...NEW_TABLES],
  backfill: addFamilyCalendar,
};
