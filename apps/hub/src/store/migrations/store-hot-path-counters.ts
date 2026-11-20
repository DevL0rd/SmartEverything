import type { Migration } from './migration';

const ENSURE_USAGE = (profile: string): string =>
  `insert into drive_usage_totals (profile_id, entries, items, folders, live, versions, trash)
    select ${profile}, 0, 0, 0, 0, 0, 0
    where not exists (select 1 from drive_usage_totals where profile_id is ${profile});`;

const ITEM_USAGE = (row: string, sign: '+' | '-'): string =>
  `update drive_usage_totals set entries = entries ${sign} 1,
    items = items ${sign} (${row}.kind <> 'folder'),
    folders = folders ${sign} (${row}.kind = 'folder'),
    live = live ${sign} (case when ${row}.kind <> 'folder' then ${row}.bytes else 0 end)
    where profile_id is ${row}.added_by_profile_id;`;

const HELD_USAGE = (column: 'versions' | 'trash', row: string, sign: '+' | '-'): string =>
  `update drive_usage_totals set entries = entries ${sign} 1, ${column} = ${column} ${sign} ${row}.bytes
    where profile_id is ${row}.added_by_profile_id;`;

const HELD_TRIGGERS = (
  table: 'drive_versions' | 'drive_trash',
  column: 'versions' | 'trash',
): string[] => [
  `create trigger ${table}_usage_insert after insert on ${table}
    begin ${ENSURE_USAGE('new.added_by_profile_id')} ${HELD_USAGE(column, 'new', '+')} end`,
  `create trigger ${table}_usage_delete after delete on ${table}
    begin ${HELD_USAGE(column, 'old', '-')} end`,
  `create trigger ${table}_usage_update after update of bytes, added_by_profile_id on ${table}
    when old.bytes <> new.bytes or old.added_by_profile_id is not new.added_by_profile_id
    begin ${HELD_USAGE(column, 'old', '-')} ${ENSURE_USAGE('new.added_by_profile_id')}
      ${HELD_USAGE(column, 'new', '+')} end`,
];

export const DRIVE_USAGE_TOTALS_BACKFILL = `insert into drive_usage_totals
    (profile_id, entries, items, folders, live, versions, trash)
  select profile_id, sum(entries), sum(items), sum(folders), sum(live), sum(versions), sum(trash) from (
    select added_by_profile_id as profile_id, count(*) as entries, sum(kind <> 'folder') as items,
      sum(kind = 'folder') as folders,
      sum(case when kind <> 'folder' then bytes else 0 end) as live, 0 as versions, 0 as trash
      from drive_items group by added_by_profile_id
    union all
    select added_by_profile_id, count(*), 0, 0, 0, sum(bytes), 0 from drive_versions
      group by added_by_profile_id
    union all
    select added_by_profile_id, count(*), 0, 0, 0, 0, sum(bytes) from drive_trash
      group by added_by_profile_id
  ) group by profile_id`;

export const STORE_HOT_PATH_COUNTERS_MIGRATION: Migration = {
  version: 239,
  name: 'store-hot-path-counters',
  statements: [
    "create index drive_media_jobs_running on drive_media_jobs (id) where state = 'running'",
    'create index commands_by_device on commands (device_id, created_at)',
    "create index drive_uploads_open_by_profile on drive_uploads (profile_id) where state = 'open'",
    `create index assistant_messages_working on assistant_messages (id)
      where role = 'responder' and state = 'working'`,
    `create table drive_usage_totals (
      profile_id text references profiles (id) on delete cascade,
      entries integer not null check (entries >= 0),
      items integer not null check (items >= 0),
      folders integer not null check (folders >= 0),
      live integer not null check (live >= 0),
      versions integer not null check (versions >= 0),
      trash integer not null check (trash >= 0)
    ) strict`,
    'create unique index drive_usage_totals_by_profile on drive_usage_totals (profile_id)',
    DRIVE_USAGE_TOTALS_BACKFILL,
    `create trigger drive_items_usage_insert after insert on drive_items
      begin ${ENSURE_USAGE('new.added_by_profile_id')} ${ITEM_USAGE('new', '+')} end`,
    `create trigger drive_items_usage_delete after delete on drive_items
      begin ${ITEM_USAGE('old', '-')} end`,
    `create trigger drive_items_usage_update after update of kind, bytes, added_by_profile_id on drive_items
      when old.kind <> new.kind or old.bytes <> new.bytes
        or old.added_by_profile_id is not new.added_by_profile_id
      begin ${ITEM_USAGE('old', '-')} ${ENSURE_USAGE('new.added_by_profile_id')}
        ${ITEM_USAGE('new', '+')} end`,
    ...HELD_TRIGGERS('drive_versions', 'versions'),
    ...HELD_TRIGGERS('drive_trash', 'trash'),
    'alter table drive_roots add column inodes integer not null default 0 check (inodes >= 0)',
    `update drive_roots set inodes = (select count(*) from drive_inodes n where n.root_id = drive_roots.id)`,
    `create trigger drive_inodes_count_insert after insert on drive_inodes
      begin update drive_roots set inodes = inodes + 1 where id = new.root_id; end`,
    `create trigger drive_inodes_count_delete after delete on drive_inodes
      begin update drive_roots set inodes = inodes - 1 where id = old.root_id; end`,
  ],
};
