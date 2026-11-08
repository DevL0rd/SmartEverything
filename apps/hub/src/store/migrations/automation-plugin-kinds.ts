import type { Migration } from './migration';

export const AUTOMATION_PLUGIN_KINDS_MIGRATION: Migration = {
  version: 148,
  name: 'automation-plugin-kinds',
  statements: [
    `create table automation_plugin_kinds (
      kind_id text primary key check (length(kind_id) >= 1),
      owner text not null check (owner like 'plugin:_%' or owner like 'driver:_%'),
      version text not null check (length(version) >= 1),
      interface_hash text not null check (length(interface_hash) = 64 and interface_hash not glob '*[^0-9a-f]*'),
      declaration text not null check (json_valid(declaration) and json_type(declaration) = 'object'),
      status text not null check (status in ('active', 'off', 'retired')),
      updated text not null
    ) strict, without rowid`,
    'create index automation_plugin_kinds_owner_idx on automation_plugin_kinds (owner)',
  ],
};
