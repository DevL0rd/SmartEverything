import type { Migration } from './migration';

export const NATIVE_CHAT_ADMISSION_MIGRATION: Migration = {
  version: 170,
  name: 'native-chat-admission',
  statements: [
    "alter table ai_chats add column native_admission text check (native_admission in ('standalone', 'retired'))",
    `with recursive retired(id, profile_id) as (
       select id, profile_id from ai_chats
       where json_extract(engine, '$.kind') in ('claude', 'codex')
         and (kind <> 'subagent' or parent_id is null or
           (json_extract(engine, '$.kind') = 'claude' and
            json_extract(engine, '$.continued_from') is not null))
       union
       select child.id, child.profile_id
       from ai_chats child join retired parent
         on child.parent_id = parent.id and child.profile_id = parent.profile_id
     )
     update ai_chats set native_admission = 'retired' where id in (select id from retired)`,
  ],
};
