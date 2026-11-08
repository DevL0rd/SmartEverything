import type { Migration } from './migration';

export const AI_REPAIR_INBOX_MIGRATION: Migration = {
  version: 166,
  name: 'ai-repair-inbox',
  statements: [
    'alter table runtime_logs add column repair_fingerprint text',
    'alter table runtime_logs add column repair_component text',
    'drop index runtime_logs_once',
    `create index runtime_logs_once on runtime_logs (source, client_id, at, event, scope, payload)`,
    `create table ai_repair_groups (
      fingerprint text primary key check (length(fingerprint) = 64),
      component text not null,
      event text not null,
      first_at text not null,
      last_at text not null,
      observations integer not null check (observations > 0),
      latest_log_id integer references runtime_logs (id) on delete set null
    ) strict`,
    'create index ai_repair_groups_latest on ai_repair_groups (last_at desc, fingerprint desc)',
    'create index ai_repair_groups_evidence on ai_repair_groups (latest_log_id)',
    `create trigger ai_repair_observe after insert on runtime_logs
     when new.repair_fingerprint is not null
     begin
       insert into ai_repair_groups (
         fingerprint, component, event, first_at, last_at, observations, latest_log_id
       )
       values (new.repair_fingerprint, new.repair_component, new.event, new.at, new.at, 1, new.id)
       on conflict (fingerprint) do update set
         first_at = min(ai_repair_groups.first_at, excluded.first_at),
         last_at = max(ai_repair_groups.last_at, excluded.last_at),
         observations = ai_repair_groups.observations + 1,
         latest_log_id = case when excluded.last_at >= ai_repair_groups.last_at
           or ai_repair_groups.latest_log_id is null then excluded.latest_log_id
           else ai_repair_groups.latest_log_id end;
     end`,
  ],
};
