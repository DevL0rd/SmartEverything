export const SIGNAL_WATCH_STATE_TABLES: readonly string[] = [
  `create table signal_watch_state (
    automation_id text not null, trigger_id text not null, partition text not null,
    last_seen_ms integer, period text, latched integer not null,
    primary key (automation_id, trigger_id, partition)
  ) strict`,
  'create index signal_watch_state_trigger on signal_watch_state(automation_id, trigger_id)',
];
