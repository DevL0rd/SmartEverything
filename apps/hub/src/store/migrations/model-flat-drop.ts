import type { Migration } from './migration';

const SHA256 = `length(sha256) = 64 and sha256 not glob '*[^0-9a-f]*'`;

const CATALOG_OWNER = `owner = 'builtin' or owner like 'provider:_%' or owner like 'plugin:_%'`;

const ASSET_OWNER = `${CATALOG_OWNER} or owner like 'user:_%'`;

export const MODEL_FLAT_DROP_MIGRATION: Migration = {
  version: 158,
  name: 'model-flat-drop',
  foreignKeys: 'off',
  statements: [
    `create table model_catalog_next (
      id text not null check (length(id) >= 1),
      version text not null check (length(version) >= 5),
      owner text not null check (${CATALOG_OWNER}),
      title text not null check (length(title) >= 1),
      category text not null check (length(category) >= 1),
      match text not null check (json_valid(match) and json_type(match) = 'object'),
      brands text not null check (json_valid(brands) and json_type(brands) = 'array'),
      aliases text not null check (json_valid(aliases) and json_type(aliases) = 'array'),
      extras text not null check (json_valid(extras) and json_type(extras) = 'array'),
      spec_sha256 text references model_assets (sha256),
      primary key (id, owner)
    ) strict, without rowid`,
    `insert into model_catalog_next (id, version, owner, title, category, match, brands, aliases, extras, spec_sha256)
      select id, version, owner, title, category, match, brands, aliases, extras, spec_sha256 from model_catalog`,
    'drop table model_catalog',
    'alter table model_catalog_next rename to model_catalog',
    'create index model_catalog_spec_idx on model_catalog (spec_sha256) where spec_sha256 is not null',
    `create table model_assets_next (
      sha256 text primary key check (${SHA256}),
      kind text not null check (kind in ('spec', 'glb')),
      bytes blob not null,
      size integer not null check (size > 0 and size = length(bytes)),
      owner text not null check (${ASSET_OWNER}),
      created text not null
    ) strict, without rowid`,
    `insert into model_assets_next (sha256, kind, bytes, size, owner, created)
      select sha256, kind, bytes, size, owner, created from model_assets where kind <> 'image'`,
    'drop table model_assets',
    'alter table model_assets_next rename to model_assets',
  ],
};
