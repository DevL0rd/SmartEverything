import { COLUMN_TYPES } from './core-tables';

const { BOOLEAN, NAMED } = COLUMN_TYPES;

export const TALK_TABLES: readonly string[] = [
  `create table talk_channels (
    id text primary key,
    ${NAMED('name', 40)},
    icon text not null,
    priority text not null check (priority in ('normal', 'urgent')),
    keep_hours integer not null check (keep_hours in (0, 1, 24, 168)),
    position integer not null default 0 check (position >= 0),
    created_at text not null,
    updated_at text not null
  ) strict`,
  `create table talk_members (
    channel_id text not null references talk_channels (id) on delete cascade,
    member_kind text not null check (member_kind in ('client', 'camera')),
    member_id text not null,
    ${BOOLEAN('listening')},
    created_at text not null,
    primary key (channel_id, member_kind, member_id)
  ) strict, without rowid`,
  `create index talk_members_by_member on talk_members (member_kind, member_id)`,
  `create table talk_messages (
    id text primary key,
    channel_id text not null references talk_channels (id) on delete cascade,
    speaker_kind text not null check (speaker_kind in ('client', 'camera')),
    speaker_id text not null,
    ${NAMED('speaker_label', 120)},
    speaker_detail text,
    kind text not null check (kind in ('talk', 'listen')),
    started_at text not null,
    duration_ms integer check (duration_ms >= 0),
    bytes integer not null default 0 check (bytes >= 0),
    storage_path text
  ) strict`,
  `create index talk_messages_by_channel on talk_messages (channel_id, started_at)`,
];

export const TALK_MEMBER_LABELS: readonly string[] = [
  `alter table talk_members add column label text not null default 'Device'
    check (length(label) between 1 and 120)`,
  'alter table talk_members add column detail text',
];
