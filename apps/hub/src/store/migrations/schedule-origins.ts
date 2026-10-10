export const SCHEDULE_ORIGIN_COLUMNS: readonly string[] = [
  "alter table scheduled_actions add column origin text check (origin is null or (json_valid(origin) and json_type(origin) = 'object'))",
];
