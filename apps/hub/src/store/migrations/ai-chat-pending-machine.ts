export const AI_CHAT_PENDING_MACHINE_COLUMNS: readonly string[] = [
  "alter table ai_chats add column pending_execution_target text check (pending_execution_target is null or (json_valid(pending_execution_target) and json_type(pending_execution_target) = 'object'))",
];
