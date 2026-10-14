export const HARNESS_SKILL_UPDATE_TABLES: readonly string[] = [
  `create table harness_skill_updates (
    singleton integer primary key check(singleton=1), automatic integer not null check(automatic in (0,1))
  ) strict`,
];
