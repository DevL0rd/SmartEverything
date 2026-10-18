const MESSAGE_COLUMNS = `id, profile_id, client_id, role, kind, author, text, attachments, state, reason, steps,
  reply_to, created_at, updated_at, chat_id, origin, embeds, cost_micros, model, reason_code, client_message_id,
  step_states, references_json`;

export const UNBOUNDED_TEXT_TABLES: readonly string[] = [
  `create table assistant_messages_rebuilt (
    id text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    client_id text,
    role text not null check (role in ('person', 'responder', 'system')),
    kind text not null check (kind in ('text', 'update', 'action', 'call')),
    author text not null check (length(author) between 1 and 120),
    text text not null,
    attachments text not null default '[]' check (json_valid(attachments) and json_type(attachments) = 'array'),
    state text check (state in ('queued', 'delivered', 'working', 'answered', 'failed')),
    reason text,
    steps text not null default '[]' check (json_valid(steps) and json_type(steps) = 'array'),
    reply_to text references assistant_messages (id) on delete set null,
    created_at text not null,
    updated_at text not null,
    chat_id text references ai_chats (id) on delete cascade,
    origin text check (origin is null or (json_valid(origin) and json_type(origin) = 'object')),
    embeds text not null default '[]' check (json_valid(embeds) and json_type(embeds) = 'array'),
    cost_micros integer not null default 0 check (cost_micros >= 0),
    model text,
    reason_code text check (reason_code is null or reason_code in ('credits', 'rate_limit', 'model_unavailable', 'offline', 'interrupted', 'stopped', 'unknown')),
    client_message_id text,
    step_states text not null default '[]' check (json_valid(step_states) and json_type(step_states) = 'array'),
    references_json text not null default '[]' check (json_valid(references_json) and json_type(references_json) = 'array')
  ) strict`,
  `insert into assistant_messages_rebuilt (${MESSAGE_COLUMNS})
    select ${MESSAGE_COLUMNS} from assistant_messages`,
  'drop table assistant_messages',
  'alter table assistant_messages_rebuilt rename to assistant_messages',
  'create index assistant_messages_by_profile on assistant_messages (profile_id, created_at)',
  'create index assistant_messages_by_chat on assistant_messages (chat_id, created_at)',
  `create unique index assistant_messages_by_client_message
    on assistant_messages (chat_id, client_message_id) where client_message_id is not null`,
  `create table transcript_lines_rebuilt (
    id integer primary key autoincrement,
    session_id text not null references transcript_sessions (id) on delete cascade,
    at text not null,
    speaker_id text,
    speaker text not null check (length(speaker) between 1 and 120),
    text text not null check (length(text) >= 1),
    bot integer not null default 0 check (bot in (0, 1)),
    ended_at text,
    timing text check (timing is null or timing = 'wall_clock')
  ) strict`,
  `insert into transcript_lines_rebuilt (id, session_id, at, speaker_id, speaker, text, bot, ended_at, timing)
    select id, session_id, at, speaker_id, speaker, text, bot, ended_at, timing from transcript_lines`,
  "delete from sqlite_sequence where name = 'transcript_lines_rebuilt'",
  `insert into sqlite_sequence (name, seq)
    select 'transcript_lines_rebuilt', seq from sqlite_sequence where name = 'transcript_lines'`,
  'drop table transcript_lines',
  'alter table transcript_lines_rebuilt rename to transcript_lines',
  'create index transcript_lines_session on transcript_lines (session_id, id)',
  'create index transcript_lines_time on transcript_lines (at, id)',
  'create index transcript_lines_session_time on transcript_lines (session_id, at, id)',
  `create trigger transcript_lines_added after insert on transcript_lines begin
    insert into transcript_lines_search (rowid, text) values (new.id, new.text);
  end`,
  `create trigger transcript_lines_removed after delete on transcript_lines begin
    insert into transcript_lines_search (transcript_lines_search, rowid, text)
    values ('delete', old.id, old.text);
  end`,
];
