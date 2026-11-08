import type { Migration } from './migration';

export const MODEL_LODS_MIGRATION: Migration = {
  version: 147,
  name: 'model-lods',
  statements: [
    `create table glb_lods (
      source_sha256 text not null references model_assets (sha256) on delete cascade,
      level integer not null check (level between 0 and 2),
      lod_sha256 text not null references model_assets (sha256),
      primary key (source_sha256, level)
    ) strict, without rowid`,
    'create index glb_lods_lod_idx on glb_lods (lod_sha256)',
  ],
};
