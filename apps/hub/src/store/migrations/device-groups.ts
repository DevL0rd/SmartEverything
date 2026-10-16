export const DEVICE_GROUP_TABLES = [
  `create table device_groups (
    id text primary key, name text not null, device_ids text not null,
    created_at text not null, updated_at text not null
  ) strict`,
] as const;
