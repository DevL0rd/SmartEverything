export const CLAUDE_CLI_TABLES = [
  `create table claude_cli_chats (
    chat_id text primary key references ai_chats(id) on delete cascade,
    profile_id text not null references profiles(id), device_id text not null references devices(id),
    cwd text not null
  ) strict`,
  `create table claude_cli_operations (
    operation_id text primary key, profile_id text not null,
    device_id text not null, chat_id text not null,
    request text not null, receipt text not null
  ) strict`,
  `create index claude_cli_chat_device on claude_cli_chats(profile_id, device_id)`,
] as const;
