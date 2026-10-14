export const HARNESS_EFFECT_AUTHORITY_TABLES: readonly string[] = [
  `create table harness_effect_authorities (
    kind text not null check(kind in ('command','schedule','automation')), id text not null,
    profile_id text not null references profiles(id), authorities text not null,
    primary key(kind,id)
  ) strict`,
];
