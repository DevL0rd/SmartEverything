import { PHONE_CONTEXT_STATES } from '@smarteverything/domain';

const STATES = PHONE_CONTEXT_STATES.map((state) => `'${state}'`).join(', ');

export const PHONE_CONTEXT_TABLES: readonly string[] = [
  `create table phone_contexts (
    device_id text primary key references devices (id) on delete cascade,
    profile_id text not null references profiles (id) on delete cascade,
    client_id text not null references clients (id) on delete cascade,
    state text not null check (state in (${STATES})),
    since text,
    confidence integer check (confidence between 0 and 100),
    place text check (place is null or length(place) between 1 and 120),
    phone_in_use integer check (phone_in_use in (0, 1)),
    reported_at text not null
  ) strict`,
  'create index phone_contexts_profile on phone_contexts (profile_id, reported_at)',
];
