import { AI_USAGE_ROW, type AiUsageRow, type UsageFilter } from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../store/codec';
import { found, type StoreContext } from '../store/context';
import { jsonText } from '../store/sql';
import type { LedgerPosition } from './ledger-page';
import { whereOf } from './usage-filter';

const STORED = storedRow(AI_USAGE_ROW, { json: ['meta'] });

const COLUMNS = [
  'id',
  'at',
  'profile_id',
  'client_id',
  'chat_id',
  'message_id',
  'call_id',
  'plugin_id',
  'worker_id',
  'source',
  'work',
  'model_id',
  'generation_id',
  'tokens_in',
  'tokens_out',
  'tokens_cached',
  'tokens_reasoning',
  'audio_in_ms',
  'audio_out_ms',
  'images',
  'video_ms',
  'cost_micros',
  'cost_state',
  'meta',
] as const;

const CHAT_LINK = z.strictObject({ chat_id: z.string().nullable() });

const LIST = COLUMNS.join(', ');

const VALUES = COLUMNS.map((column) => `$${column}`).join(', ');

export interface UsagePage {
  readonly filter: UsageFilter;
  readonly after: LedgerPosition | null;
  readonly limit: number;
}

export class UsageStore {
  constructor(private readonly context: StoreContext) {}

  chatOf(messageId: string | null, callId: string | null): string | null {
    const row = this.context.sql.get(
      CHAT_LINK,
      `select coalesce(
         (select m.chat_id from assistant_messages m where m.id = $message_id),
         (select coalesce(o.chat_id, o.from_chat_id) from ai_outreach o where o.id = $call_id)
       ) as chat_id`,
      { message_id: messageId, call_id: callId },
    );
    return row === undefined ? null : row.chat_id;
  }

  insert(row: AiUsageRow): void {
    this.context.sql.run('record AI usage', `insert into ai_usage (${LIST}) values (${VALUES})`, {
      ...row,
      meta: jsonText(row.meta),
    });
  }

  replace(row: AiUsageRow): void {
    this.context.sql.run(
      'update AI usage',
      `update ai_usage set tokens_in = $tokens_in, tokens_out = $tokens_out,
        tokens_cached = $tokens_cached, tokens_reasoning = $tokens_reasoning,
        cost_micros = $cost_micros, cost_state = $cost_state, generation_id = $generation_id, meta = $meta where id = $id`,
      {
        id: row.id,
        tokens_in: row.tokens_in,
        tokens_out: row.tokens_out,
        tokens_cached: row.tokens_cached,
        tokens_reasoning: row.tokens_reasoning,
        cost_micros: row.cost_micros,
        cost_state: row.cost_state,
        generation_id: row.generation_id,
        meta: jsonText(row.meta),
      },
    );
  }

  get(id: string): AiUsageRow {
    return found(
      this.context.sql.get(STORED, `select ${LIST} from ai_usage where id = $id`, { id }),
      'AI usage record',
      id,
    );
  }

  pendingHarness(): AiUsageRow[] {
    return this.context.sql.all(
      STORED,
      `select ${LIST} from ai_usage where generation_id is not null and cost_state in ('estimated','reported') and json_extract(meta,'$.harness_session_id') is not null`,
    );
  }

  page(page: UsagePage): AiUsageRow[] {
    const where = whereOf(page.filter);
    const after =
      page.after === null ? '' : ' and (at < $after_at or (at = $after_at and id < $after_id))';
    return this.context.sql.all(
      STORED,
      `select ${LIST} from ai_usage where ${where.text}${after} order by at desc, id desc limit $limit`,
      {
        ...where.parameters,
        ...(page.after === null ? {} : { after_at: page.after.at, after_id: page.after.id }),
        limit: page.limit,
      },
    );
  }
}
