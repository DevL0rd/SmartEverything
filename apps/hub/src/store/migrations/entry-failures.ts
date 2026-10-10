export const ENTRY_FAILURE_TABLES: readonly string[] = [
  `create table health_entry_failures (
    entry_id text not null references health_entries (id) on delete cascade,
    source_id text not null references health_sources (id) on delete cascade,
    version integer not null check (version >= 1),
    reason text not null check (length(reason) between 1 and 500),
    failed_at text not null,
    primary key (entry_id, source_id)
  ) strict, without rowid`,
];
