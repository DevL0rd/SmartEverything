import type { Migration } from './migration';

export const RUNTIME_LOGS_OUT_MIGRATION: Migration = {
  version: 241,
  name: 'runtime-logs-out',
  foreignKeys: 'off',
  statements: [
    'drop trigger ai_repair_observe',
    'drop trigger runtime_logs_search_after',
    'drop trigger runtime_logs_search_delete',
    'drop table runtime_logs_search',
    `create table ai_repair_groups_new (
      fingerprint text primary key check (length(fingerprint) = 64),
      component text not null,
      event text not null,
      first_at text not null,
      last_at text not null,
      observations integer not null check (observations > 0),
      latest_log_id integer,
      admission text,
      automatic_admitted integer not null default 0 check (automatic_admitted in (0, 1)),
      failed_event_id text,
      dismissed_observations integer not null default 0
        check (dismissed_observations between 0 and observations)
    ) strict`,
    `insert into ai_repair_groups_new (fingerprint, component, event, first_at, last_at,
       observations, latest_log_id, admission, automatic_admitted, failed_event_id,
       dismissed_observations)
     select fingerprint, component, event, first_at, last_at, observations, null, admission,
       automatic_admitted, failed_event_id, dismissed_observations
     from ai_repair_groups`,
    'drop table ai_repair_groups',
    'alter table ai_repair_groups_new rename to ai_repair_groups',
    'create index ai_repair_groups_evidence on ai_repair_groups (latest_log_id)',
    `create index ai_repair_event on ai_repair_groups (json_extract(admission, '$.eventId'))
     where admission is not null`,
    `create index ai_repair_groups_latest on ai_repair_groups (last_at desc, fingerprint desc)
     where observations > dismissed_observations`,
    'drop table runtime_logs',
    'drop table runtime_log_sources',
    'drop table runtime_log_gaps',
    'drop table runtime_log_footprint',
  ],
};
