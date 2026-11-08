import type { Migration } from './migration';

const SHA256 = `length(sha256) = 64 and sha256 not glob '*[^0-9a-f]*'`;

const CATALOG_OWNER = `owner = 'builtin' or owner like 'provider:_%' or owner like 'plugin:_%'`;

const ASSET_OWNER = `${CATALOG_OWNER} or owner like 'user:_%'`;

export const MODELS_MIGRATION: Migration = {
  version: 145,
  name: 'models',
  statements: [
    `create table model_assets (
      sha256 text primary key check (${SHA256}),
      kind text not null check (kind in ('spec', 'glb', 'image')),
      bytes blob not null,
      size integer not null check (size > 0 and size = length(bytes)),
      owner text not null check (${ASSET_OWNER}),
      created text not null
    ) strict, without rowid`,
    `create table model_catalog (
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
      flat_sha256 text references model_assets (sha256),
      primary key (id, owner)
    ) strict, without rowid`,
    'create index model_catalog_spec_idx on model_catalog (spec_sha256) where spec_sha256 is not null',
    'create index model_catalog_flat_idx on model_catalog (flat_sha256) where flat_sha256 is not null',
    `create table model_overrides (
      scope text not null check (scope in ('device', 'identity', 'family')),
      target text not null check (length(target) >= 1),
      model_id text check (model_id is null or length(model_id) >= 1),
      asset_hash text references model_assets (sha256),
      finish text check (finish is null or length(finish) >= 1),
      params text not null check (json_valid(params) and json_type(params) = 'object'),
      set_by text not null check (length(set_by) >= 1),
      updated_at text not null,
      check ((model_id is null) <> (asset_hash is null)),
      primary key (scope, target)
    ) strict, without rowid`,
    'create index model_overrides_asset_idx on model_overrides (asset_hash) where asset_hash is not null',
  ],
};
