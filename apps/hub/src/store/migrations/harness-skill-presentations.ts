export const HARNESS_SKILL_PRESENTATION_TABLES: readonly string[] = [
  `create table harness_skill_presentations (
    asset_identity text primary key, presentation text not null, created_at text not null
  ) strict`,
];
