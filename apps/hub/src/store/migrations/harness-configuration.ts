export const HARNESS_CONFIGURATION_TABLES: readonly string[] = [
  `create table harness_configuration_revisions (
    revision text primary key, configuration text not null, created_at text not null
  ) strict`,
  `insert into harness_configuration_revisions(revision,configuration,created_at)
    values('initial','{"revision":"initial","entries":[]}',strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
  `create table harness_configuration_current (
    singleton integer primary key check(singleton=1),
    revision text not null references harness_configuration_revisions(revision)
  ) strict`,
  `insert into harness_configuration_current(singleton,revision) values(1,'initial')`,
  `create table harness_configuration_reports (
    target_key text primary key, report text not null, received_at text not null
  ) strict`,
  `create table harness_configuration_assets (
    kind text not null check(kind in ('package','skill')), name text not null,
    version text not null, identity text not null, primary key(kind,name,version)
  ) strict`,
];
