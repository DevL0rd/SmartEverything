import { COLUMN_TYPES } from './core-tables';

const { BOOLEAN, JSON_ARRAY, JSON_OBJECT, NAMED } = COLUMN_TYPES;

export const AI_MODEL_TABLES: readonly string[] = [
  `create table ai_settings (
    key text primary key check (length(key) between 1 and 40),
    settings text not null check (json_valid(settings) and json_type(settings) = 'object'),
    updated_at text not null
  ) strict`,
  `create table ai_models (
    id text primary key check (length(id) between 3 and 200),
    provider text not null check (provider in ('openrouter', 'google')),
    ${NAMED('name', 120)},
    ${NAMED('author', 80)},
    ${NAMED('author_name', 80)},
    ${NAMED('family', 120)},
    description text not null check (length(description) <= 4000),
    created text not null,
    context_length integer check (context_length >= 0),
    max_output integer check (max_output >= 0),
    ${JSON_ARRAY('input_modalities')},
    ${JSON_ARRAY('output_modalities')},
    ${JSON_ARRAY('supported_parameters')},
    reasoning text not null check (reasoning in ('none', 'optional', 'mandatory')),
    ${JSON_ARRAY('efforts')},
    default_effort text,
    ${BOOLEAN('tools')},
    alias_of text,
    ${JSON_OBJECT('pricing')},
    ${JSON_ARRAY('kinds')},
    expires_at text,
    synced_at text not null,
    gone_at text
  ) strict`,
  'create index ai_models_by_provider on ai_models (provider, gone_at)',
  `create table ai_model_prices (
    model_id text not null references ai_models (id) on delete cascade,
    effective_at text not null,
    ${JSON_OBJECT('pricing')},
    primary key (model_id, effective_at)
  ) strict`,
];
