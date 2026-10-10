export const OUTREACH_ORIGIN_COLUMNS: readonly string[] = [
  "alter table ai_outreach add column origin text check (origin is null or (json_valid(origin) and json_type(origin) = 'object'))",
];
