export const AUTOMATION_AUTHOR_STATEMENTS: readonly string[] = [
  "alter table automations add column author text check (author is null or (json_valid(author) and json_type(author) = 'object'))",
];
