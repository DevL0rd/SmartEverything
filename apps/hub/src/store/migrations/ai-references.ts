export const AI_REFERENCE_COLUMNS: readonly string[] = [
  "alter table assistant_messages add column references_json text not null default '[]' check(json_valid(references_json) and json_type(references_json) = 'array')",
  'create index ai_chats_reference_titles on ai_chats(profile_id, id) where deletion_state is null',
];
