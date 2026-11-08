import type { Migration } from './migration';

const RELAYED = `json_extract(origin, '$.source') in ('chat', 'subagent')`;

const FROM_EVENT = `(select e.report_to from assistant_events e
  where e.message_id = assistant_messages.id and e.report_to is not null limit 1)`;

const FROM_HELPER = `(select json_extract(d.value, '$.helper_chat_id')
  from json_each(assistant_messages.embeds) d
  where json_extract(d.value, '$.kind') = 'helper_dialogue'
    and json_extract(d.value, '$.direction') = 'from_helper' limit 1)`;

const FROM_PARENT = `(select assistant_messages.chat_id
  from json_each(assistant_messages.embeds) d
  where json_extract(d.value, '$.kind') = 'helper_dialogue'
    and json_extract(d.value, '$.direction') = 'to_helper' limit 1)`;

export const RELAYED_PARTICIPANTS_MIGRATION: Migration = {
  version: 189,
  name: 'relayed-participants',
  statements: [
    `update assistant_messages
     set origin = json_set(origin, '$.chat_id', coalesce(${FROM_EVENT}, ${FROM_HELPER}, ${FROM_PARENT}))
     where ${RELAYED} and json_type(origin, '$.chat_id') is null
       and coalesce(${FROM_EVENT}, ${FROM_HELPER}, ${FROM_PARENT}) is not null
       and coalesce(${FROM_EVENT}, ${FROM_HELPER}, ${FROM_PARENT}) in (select id from ai_chats)`,
    `update assistant_messages
     set author = coalesce(
       (select c.helper_name from ai_chats c where c.id = json_extract(origin, '$.chat_id')),
       (select json_extract(s.settings, '$.name') from assistant_settings s where s.id = 1),
       'Coordinator')
     where ${RELAYED} and json_type(origin, '$.chat_id') is not null`,
  ],
};
