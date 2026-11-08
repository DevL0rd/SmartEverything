import type { Migration } from './migration';

export const GOOGLE_ACCOUNTS_MIGRATION: Migration = {
  version: 180,
  name: 'google-accounts',
  statements: [
    `create table google_accounts (
      profile_id text primary key references profiles (id) on delete cascade,
      email text,
      scopes text not null check (json_valid(scopes) and json_type(scopes) = 'array'),
      status text not null check (status in ('linking', 'linked', 'needs_attention', 'unlinked')),
      problem text check (
        problem in ('invalid_grant', 'scope_missing', 'client_missing', 'network', 'rate_limited', 'cancelled', 'unknown')
      ),
      calendar_ids text not null check (json_valid(calendar_ids) and json_type(calendar_ids) = 'array'),
      list_ids text not null check (json_valid(list_ids) and json_type(list_ids) = 'array'),
      last_sync_at text,
      last_error text
    ) strict`,
    `create table google_sync_state (
      profile_id text not null references google_accounts (profile_id) on delete cascade,
      product text not null check (product in ('calendar', 'tasks')),
      resource_id text not null check (length(resource_id) > 0),
      sync_token text,
      channel text check (json_valid(channel) and json_type(channel) = 'object'),
      last_pull_at text,
      primary key (profile_id, product, resource_id)
    ) strict`,
    `create unique index google_sync_state_by_channel on google_sync_state (
      (json_extract(channel, '$.channel_id'))
    ) where channel is not null`,
    `create table google_sync_log (
      id text primary key,
      profile_id text not null references google_accounts (profile_id) on delete cascade,
      at text not null,
      trigger text not null check (
        trigger in ('link', 'manual', 'visible', 'push', 'change', 'ring', 'reconcile')
      ),
      product text check (product in ('calendar', 'tasks')),
      counts text not null check (json_valid(counts) and json_type(counts) = 'object'),
      conflicts text not null check (json_valid(conflicts) and json_type(conflicts) = 'array'),
      error text,
      choice text check (json_valid(choice) and json_type(choice) = 'object')
    ) strict`,
    'create index google_sync_log_by_profile on google_sync_log (profile_id, at desc)',
    'create index google_sync_log_by_age on google_sync_log (at)',
  ],
};
