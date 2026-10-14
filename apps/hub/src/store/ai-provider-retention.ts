import type { Sql } from './sql';

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
