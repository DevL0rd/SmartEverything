import { COLUMN_TYPES } from './core-tables';

const { JSON_OBJECT } = COLUMN_TYPES;

const METER = (column: string): string =>
  `${column} integer not null default 0 check (${column} >= 0)`;

export const AI_USAGE_TABLES: readonly string[] = [
  `create table ai_usage (
    id text primary key,
    at text not null,
    profile_id text not null references profiles (id) on delete cascade,
    client_id text,
    chat_id text,
    message_id text,
    call_id text,
    plugin_id text,
    worker_id text,
    source text not null check (source in ('openrouter', 'gemini', 'gemini_live', 'claude', 'codex')),
    work text not null check (work in ('chat', 'voice', 'subagent', 'wake', 'routine', 'image', 'video', 'transcribe', 'embed', 'worker')),
    model_id text,
    generation_id text,
    ${METER('tokens_in')},
    ${METER('tokens_out')},
    ${METER('tokens_cached')},
    ${METER('tokens_reasoning')},
    ${METER('audio_in_ms')},
    ${METER('audio_out_ms')},
    ${METER('images')},
    ${METER('video_ms')},
    ${METER('cost_micros')},
    cost_state text not null check (cost_state in ('estimated', 'reported', 'reconciled', 'plan')),
    ${JSON_OBJECT('meta')}
  ) strict`,
  'create index ai_usage_by_at on ai_usage (at)',
  'create index ai_usage_by_profile on ai_usage (profile_id, at)',
  'create index ai_usage_by_client on ai_usage (client_id, at)',
  'create index ai_usage_by_work on ai_usage (work, at)',
  'create index ai_usage_by_chat on ai_usage (chat_id)',
  'create index ai_usage_by_message on ai_usage (message_id)',
];
