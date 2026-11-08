import { AI_CHAT_LOCAL_METER_SAMPLE, USAGE_SERIES_POINTS_MAX } from '@smarteverything/domain';
import type { z } from 'zod';
import type { StoreContext } from '../context';

const HOUR_MS = 3_600_000;
type LocalMeterSample = z.infer<typeof AI_CHAT_LOCAL_METER_SAMPLE>;

function historyStart(at: string): string {
  return new Date(Date.parse(at) - HOUR_MS).toISOString();
}

export function readChatMeterHistory(context: StoreContext, id: string): LocalMeterSample[] {
  const at = context.now();
  return context.sql.all(
    AI_CHAT_LOCAL_METER_SAMPLE,
    `select at, kind, percent from ai_chat_meter_history
     where chat_id = $id and at between $since and $at order by at, rowid`,
    { id, since: historyStart(at), at },
  );
}

export function appendChatMeterSample(
  context: StoreContext,
  id: string,
  change: {
    readonly kind: LocalMeterSample['kind'];
    readonly before: number | null;
    readonly percent: number | null;
  },
): void {
  const { kind, before, percent } = change;
  if (percent === null || before === percent) return;
  const at = context.now();
  context.sql.run(
    'record the AI chat meter reading',
    `insert into ai_chat_meter_history (chat_id, at, kind, percent)
     values ($id, $at, $kind, $percent)`,
    { id, at, kind, percent },
  );
  context.sql.run(
    'expire old AI chat meter readings',
    'delete from ai_chat_meter_history where at < $since',
    { since: historyStart(at) },
  );
  context.sql.run(
    'keep the newest AI chat meter readings within the chart limit',
    `delete from ai_chat_meter_history where rowid = (
       select rowid from ai_chat_meter_history where chat_id = $id and kind = $kind
       order by at desc, rowid desc limit 1 offset $limit
     )`,
    { id, kind, limit: USAGE_SERIES_POINTS_MAX },
  );
}
