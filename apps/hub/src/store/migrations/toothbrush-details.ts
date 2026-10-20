export const TOOTHBRUSH_DETAILS_STATEMENTS: readonly string[] = [
  'alter table brushing_sessions add column details text check (details is null or json_valid(details))',
];
