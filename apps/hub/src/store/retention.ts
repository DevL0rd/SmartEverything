import { DAY_MS } from '../metrics/minute';
import { AUTOMATION_DECISION_DAYS } from './retention-automations';
import type { Sql } from './sql';

const KEPT_DAYS = 90;

const TREADMILL_SAMPLE_DAYS = 400;

const BOTTLE_KEPT_DAYS = 400;

const MS_PER_SECOND = 1000;

export const RETENTION_BATCH_ROWS = 500;

export interface AgedRows {
  readonly table: string;
  readonly key: string;
  readonly where: string;
  readonly before: (now: Date) => string | number;
}

function daysBefore(days: number): (now: Date) => string {
  return (now) => new Date(now.getTime() - days * DAY_MS).toISOString();
}

const BOTTLE_TABLES = [
  { table: 'bottle_readings', key: 'device_id, at, trigger_type, distance_mm' },
  { table: 'bottle_uv_cycles', key: 'device_id, at' },
  { table: 'bottle_faults', key: 'device_id, at, type' },
  { table: 'bottle_battery', key: 'device_id, at, source' },
  { table: 'bottle_state_log', key: 'device_id, at' },
  { table: 'bottle_adc', key: 'device_id, kind, at' },
] as const;

export const AGED_ROWS: readonly AgedRows[] = [
  { table: 'ai_wakes', key: 'rowid', where: 'created_at < $before', before: daysBefore(KEPT_DAYS) },
  {
    table: 'ai_outreach',
    key: 'rowid',
    where: 'created_at < $before',
    before: daysBefore(KEPT_DAYS),
  },
  {
    table: 'app_sessions',
    key: 'rowid',
    where: 'ended_at < $before',
    before: daysBefore(KEPT_DAYS),
  },
  { table: 'access_audit', key: 'rowid', where: 'at < $before', before: daysBefore(KEPT_DAYS) },
  { table: 'google_sync_log', key: 'rowid', where: 'at < $before', before: daysBefore(KEPT_DAYS) },
  ...BOTTLE_TABLES.map(({ table, key }) => ({
    table,
    key,
    where: 'at < $before',
    before: (now: Date): number =>
      Math.floor((now.getTime() - BOTTLE_KEPT_DAYS * DAY_MS) / MS_PER_SECOND),
  })),
  {
    table: 'bottle_syncs',
    key: 'device_id, started_at',
    where: 'started_at < $before',
    before: daysBefore(BOTTLE_KEPT_DAYS),
  },
  {
    table: 'photo_unlocks',
    key: 'rowid',
    where: 'expires_at <= $before',
    before: (now: Date): string => now.toISOString(),
  },
  {
    table: 'treadmill_samples',
    key: 'session_id, t_s',
    where: 'session_id in (select id from treadmill_sessions where started_at < $before)',
    before: daysBefore(TREADMILL_SAMPLE_DAYS),
  },
  {
    table: 'automation_decisions',
    key: 'automation_id, window_start, reason',
    where: 'window_start < $before',
    before: daysBefore(AUTOMATION_DECISION_DAYS),
  },
  {
    table: 'automation_questions',
    key: 'id',
    where: "state <> 'open' and created_at < $before",
    before: daysBefore(AUTOMATION_DECISION_DAYS),
  },
];

export function sweepAgedBatch(sql: Sql, aged: AgedRows, now: Date): number {
  return sql.run(
    `forget a batch of old ${aged.table}`,
    `delete from ${aged.table} where (${aged.key}) in
       (select ${aged.key} from ${aged.table} where ${aged.where} limit $batch)`,
    { before: aged.before(now), batch: RETENTION_BATCH_ROWS },
  );
}

export function agedRowsNamed(table: string): AgedRows {
  const aged = AGED_ROWS.find((candidate) => candidate.table === table);
  if (aged === undefined) throw new Error(`No retention rule covers the table ${table}.`);
  return aged;
}

export const KEPT_PROVIDER_EVENTS = 200;
export const KEPT_PROVIDER_EVENT_BYTES = 8 * 1024 * 1024;

export function retainProviderEvents(sql: Sql, chatId: string): void {
  sql.run(
    'bound provider event history while keeping lifecycle records first',
    `with ranked as (
        select rowid,
          row_number() over kept as position,
          sum(length(cast(event as blob))) over kept as bytes
        from ai_provider_events where chat_id=$chat
        window kept as (order by
          case json_extract(event, '$.kind')
            when 'accepted' then 0 when 'completed' then 0 when 'failed' then 0
            when 'prompt' then 0 when 'dialog' then 0 when 'usage' then 0 when 'rate_limit' then 0
            when 'tool_call' then 1 when 'tool_result' then 1 when 'runtime' then
              case when json_extract(event, '$.payload.subtype') in
                ('init','background_tasks_changed','task_notification') then 0
                when json_extract(event, '$.type') in ('assistant','user') then 1 else 2 end
            else 2 end,
          created_at desc, rowid desc)
      ) delete from ai_provider_events where rowid in
        (select rowid from ranked where position>$count or bytes>$bytes)`,
    { chat: chatId, count: KEPT_PROVIDER_EVENTS, bytes: KEPT_PROVIDER_EVENT_BYTES },
  );
}
