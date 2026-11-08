import type { AiChatRow } from '@smarteverything/domain';
import { z } from 'zod';
import { assignments, type StoreContext } from '../context';
import { appendChatMeterSample } from './ai-chat-meter-history';

export type ChatMeters = Partial<
  Pick<AiChatRow, 'context_percent' | 'last_input_tokens' | 'last_cached_tokens'>
>;

export const CACHE_WINDOW = 10;

export const CACHE_WINDOW_SQL = `coalesce((
  select case when sum(tokens_in) > 0
    then cast(floor(min(100.0, max(0.0, 100.0 * sum(tokens_cached) / sum(tokens_in)))) as integer)
    else null end
  from (select tokens_in, tokens_cached from ai_usage
        where chat_id = ai_chats.id and tokens_in > 0
        order by at desc, rowid desc limit ${String(CACHE_WINDOW)})), null)`;

const CACHE_METER = z.strictObject({ percent: z.int().nullable() });

const METERS = ['context_percent', 'last_input_tokens', 'last_cached_tokens'] as const;

export function forgottenMeters(modelChanged: boolean): ChatMeters {
  return modelChanged
    ? { context_percent: null, last_input_tokens: null, last_cached_tokens: null }
    : {};
}

export function noteChatMeters(
  context: StoreContext,
  read: (id: string) => AiChatRow,
  id: string,
  meters: ChatMeters,
): void {
  context.write(() => {
    const before = read(id);
    if (METERS.every((key) => meters[key] === undefined || before[key] === meters[key])) return;
    const set = assignments(meters);
    context.sql.run(
      'note how the AI chat measures',
      `update ai_chats set ${set.text} where id = $id`,
      {
        ...set.parameters,
        id,
      },
    );
    const after = read(id);
    appendChatMeterSample(context, id, {
      kind: 'context',
      before: before.context_percent,
      percent: after.context_percent,
    });
    context.changed('ai_chats', 'UPDATE', after, before);
  });
}

function cacheMeter(context: StoreContext, id: string): number | null {
  return (
    context.sql.get(
      CACHE_METER,
      `select ${CACHE_WINDOW_SQL} as percent from ai_chats where id = $id`,
      {
        id,
      },
    )?.percent ?? null
  );
}

export function trackCacheMeter(context: StoreContext, id: string | null, write: () => void): void {
  if (id === null) {
    write();
    return;
  }
  context.write(() => {
    const before = cacheMeter(context, id);
    write();
    appendChatMeterSample(context, id, { kind: 'cache', before, percent: cacheMeter(context, id) });
  });
}
