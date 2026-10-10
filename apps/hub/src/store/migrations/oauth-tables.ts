import { COLUMN_TYPES } from './core-tables';

const { JSON_ARRAY } = COLUMN_TYPES;

export const OAUTH_TABLES: readonly string[] = [
  `alter table oauth_clients add column auth_method text not null default 'none'
    check (auth_method in ('none', 'client_secret_post', 'client_secret_basic'))`,
  'alter table oauth_clients add column secret_hash text',
  `create table oauth_tokens (
    token_hash text primary key,
    kind text not null check (kind in ('access', 'refresh')),
    client_id text not null references oauth_clients (id) on delete cascade,
    family text not null,
    ${JSON_ARRAY('scopes')},
    resource text not null,
    created_at text not null,
    expires_at text not null,
    used_at text
  ) strict`,
  'create index oauth_tokens_family_idx on oauth_tokens (family)',
  'create index oauth_tokens_expiry_idx on oauth_tokens (expires_at)',
];
