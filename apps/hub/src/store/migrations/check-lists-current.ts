import { COLUMN_TYPES } from './core-tables';

const { BOOLEAN, JSON_ARRAY, JSON_OBJECT, NAMED } = COLUMN_TYPES;

const PROFILE_COLUMNS =
  'id, name, colour, sex, birth_date, height_cm, scale_user, fitness_goals, max_heart_rate, position, created_at, updated_at';

const DEVICE_COLUMNS =
  'id, provider, external_id, parent_id, kind, name, display_name, model, manufacturer, provider_room, room_id, online, capabilities, details, hidden, favourite, position, created_at, updated_at';

const PHONE_CONTEXT_COLUMNS =
  'device_id, profile_id, client_id, state, since, confidence, place, phone_in_use, reported_at';

const PROVIDER_LINK_COLUMNS =
  'provider, account_label, status, prompt, last_error, device_count, updated_at, phase, problem';

export const CHECK_LISTS_CURRENT_STATEMENTS: readonly string[] = [
  `create table profiles_current (
    id text primary key,
    ${NAMED('name', 40)},
    colour text not null check (colour in ('amber', 'aqua', 'rose', 'violet', 'lime', 'ice')),
    sex text check (sex in ('female', 'male')),
    birth_date text check (birth_date is null or date(birth_date) = birth_date),
    height_cm integer check (height_cm between 100 and 250),
    scale_user integer check (scale_user between 0 and 255),
    ${JSON_OBJECT('fitness_goals')},
    max_heart_rate integer check (max_heart_rate between 120 and 220),
    position integer not null default 0 check (position >= 0),
    created_at text not null,
    updated_at text not null
  ) strict`,
  `insert into profiles_current (${PROFILE_COLUMNS}) select ${PROFILE_COLUMNS} from profiles`,
  'drop table profiles',
  'alter table profiles_current rename to profiles',
  `create table devices_current (
    id text primary key,
    provider text not null check (provider in ('xiaomi', 'tuya', 'smartthings', 'samsung_tv', 'local')),
    external_id text not null check (length(external_id) > 0),
    parent_id text references devices (id) on delete set null,
    kind text not null,
    ${NAMED('name', 120)},
    display_name text check (length(display_name) between 1 and 120),
    model text not null,
    manufacturer text not null,
    provider_room text,
    room_id text references rooms (id) on delete set null,
    ${BOOLEAN('online')} default 1,
    ${JSON_ARRAY('capabilities')},
    ${JSON_OBJECT('details')},
    ${BOOLEAN('hidden')} default 0,
    ${BOOLEAN('favourite')} default 0,
    position integer not null default 0 check (position >= 0),
    created_at text not null,
    updated_at text not null,
    unique (provider, external_id)
  ) strict`,
  `insert into devices_current (${DEVICE_COLUMNS}) select ${DEVICE_COLUMNS} from devices`,
  'drop table devices',
  'alter table devices_current rename to devices',
  'create index devices_room_idx on devices (room_id)',
  `create table phone_contexts_current (
    device_id text primary key references devices (id) on delete cascade,
    profile_id text not null references profiles (id) on delete cascade,
    client_id text not null references clients (id) on delete cascade,
    state text not null check (state in ('unknown', 'still', 'walking', 'running', 'cycling', 'driving', 'navigating', 'parked')),
    since text,
    confidence integer check (confidence between 0 and 100),
    place text check (place is null or length(place) between 1 and 120),
    phone_in_use integer check (phone_in_use in (0, 1)),
    reported_at text not null
  ) strict`,
  `insert into phone_contexts_current (${PHONE_CONTEXT_COLUMNS}) select ${PHONE_CONTEXT_COLUMNS} from phone_contexts`,
  'drop table phone_contexts',
  'alter table phone_contexts_current rename to phone_contexts',
  'create index phone_contexts_profile on phone_contexts (profile_id, reported_at)',
  `create table provider_links_current (
    provider text primary key check (provider in ('xiaomi', 'tuya', 'smartthings', 'samsung_tv')),
    account_label text,
    status text not null default 'linking'
      check (status in ('linking', 'linked', 'needs_attention', 'unlinked')),
    prompt text check (prompt is null or (json_valid(prompt) and json_type(prompt) = 'object')),
    last_error text,
    device_count integer not null default 0 check (device_count >= 0),
    updated_at text not null,
    phase text check (phase is null or phase in ('signing_in', 'awaiting_answer', 'discovering')),
    problem text check (problem is null or problem in ('bad_credentials', 'permission_denied', 'network', 'session_expired', 'qr_expired', 'cancelled', 'rate_limited', 'not_supported', 'unknown'))
  ) strict`,
  `insert into provider_links_current (${PROVIDER_LINK_COLUMNS}) select ${PROVIDER_LINK_COLUMNS} from provider_links`,
  'drop table provider_links',
  'alter table provider_links_current rename to provider_links',
];
