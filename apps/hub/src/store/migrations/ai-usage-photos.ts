import { COLUMN_TYPES } from './core-tables';
import type { Migration } from './migration';

const { JSON_OBJECT, METER } = COLUMN_TYPES;

const COLUMNS =
  'id, at, profile_id, client_id, chat_id, message_id, call_id, plugin_id, worker_id, source, work, model_id, generation_id, tokens_in, tokens_out, tokens_cached, tokens_reasoning, audio_in_ms, audio_out_ms, images, video_ms, cost_micros, cost_state, meta';

const STATEMENTS: readonly string[] = [
  `create table ai_usage_next (
    id text primary key,
    at text not null,
    profile_id text not null references profiles (id) on delete cascade,
    client_id text,
    chat_id text,
    message_id text,
    call_id text,
    plugin_id text,
    worker_id text,
    source text not null check (source in ('openrouter', 'gemini', 'gemini_live')),
    work text not null check (work in ('chat', 'voice', 'subagent', 'wake', 'routine', 'image', 'video', 'transcribe', 'embed', 'speak', 'photos')),
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
    cost_state text not null check (cost_state in ('estimated', 'reported', 'reconciled')),
    ${JSON_OBJECT('meta')}
  ) strict`,
  `insert into ai_usage_next (${COLUMNS}) select ${COLUMNS} from ai_usage`,
  'drop table ai_usage',
  'alter table ai_usage_next rename to ai_usage',
  'create index ai_usage_by_at on ai_usage (at)',
  'create index ai_usage_by_profile on ai_usage (profile_id, at)',
  'create index ai_usage_by_client on ai_usage (client_id, at)',
  'create index ai_usage_by_work on ai_usage (work, at)',
  'create index ai_usage_by_chat on ai_usage (chat_id)',
  'create index ai_usage_by_message on ai_usage (message_id)',
  'create index ai_usage_by_chat_meter on ai_usage (chat_id, at) where tokens_in > 0',
];

export const AI_USAGE_PHOTOS_MIGRATION: Migration = {
  version: 216,
  name: 'ai-usage-photos',
  foreignKeys: 'off',
  statements: STATEMENTS,
};
