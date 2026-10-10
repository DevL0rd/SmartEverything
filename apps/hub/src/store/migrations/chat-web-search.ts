export const CHAT_WEB_SEARCH_COLUMNS: readonly string[] = [
  'alter table ai_chats add column web_search integer check (web_search is null or web_search in (0, 1))',
];
