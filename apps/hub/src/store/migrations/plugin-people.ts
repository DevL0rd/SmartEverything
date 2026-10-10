export const PLUGIN_PEOPLE_TABLES: readonly string[] = [
  `create table plugin_people (
    plugin_id text not null references plugins (id) on delete cascade,
    external_id text not null check (length(external_id) between 1 and 200),
    name text not null check (length(name) between 1 and 120),
    status text not null check (status in ('approved', 'owner')),
    created_at text not null,
    updated_at text not null,
    primary key (plugin_id, external_id)
  ) strict, without rowid`,
  "create unique index plugin_people_one_owner on plugin_people (plugin_id) where status = 'owner'",
];
