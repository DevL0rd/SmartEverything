export const CHAT_TITLE_COLUMNS: readonly string[] = [
  'alter table ai_chats add column title_auto integer not null default 1 check (title_auto in (0, 1))',
  `update ai_chats set title_auto = 0
   where title not in ('New chat', 'Earlier chat') and title not like 'Voice · %' and kind <> 'call'`,
];
