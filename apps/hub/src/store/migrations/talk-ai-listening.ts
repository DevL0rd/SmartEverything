export const TALK_AI_LISTENING_COLUMNS: readonly string[] = [
  `alter table talk_channels add column ai_listens integer not null default 1
    check (ai_listens in (0, 1))`,
  'alter table talk_messages add column transcript text',
];
