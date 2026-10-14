export const DURABLE_EFFECT_AUTHORITY_TABLES: readonly string[] = [
  `create table harness_authorities_next (
    event_id text primary key, authority text not null
  ) strict`,
  'insert into harness_authorities_next(event_id,authority) select event_id,authority from harness_authorities',
  'drop table harness_authorities',
  'alter table harness_authorities_next rename to harness_authorities',
];
