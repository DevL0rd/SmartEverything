import { randomUUID } from 'node:crypto';
import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { jsonText, type Sql } from '../sql';

const FIRST_AREAS = [
  'home',
  'devices',
  'computers',
  'control',
  'automations',
  'history',
  'health',
  'nutrition',
  'cameras',
  'talk',
  'assistant',
  'settings',
  'people',
  'plugins',
  'system',
  'everything',
];

const FULL_SCOPES = {
  areas: FIRST_AREAS,
  devices: { mode: 'all', rooms: [], devices: [] },
  models: { mode: 'default', ids: [] },
  channels: { mode: 'all', ids: [] },
};

const NO_CONDITIONS = { home_only: false, schedule: null };

const PROFILE_NAME_LONGEST = 40;

const NEW_PERSON_COLOUR = 'aqua';

const UNSET_FITNESS_GOALS = {
  steps: null,
  move_kcal: null,
  active_minutes: null,
  sleep_minutes: null,
  hydration_ml: null,
};

export const PERSON_ACCESS_STATEMENTS: readonly string[] = [
  `create table person_access (
    profile_id text primary key references profiles (id) on delete cascade,
    role text not null check (role in ('owner', 'member', 'guest')),
    template text not null check (template in ('owner', 'adult', 'child', 'guest')),
    scopes text not null check (json_valid(scopes) and json_type(scopes) = 'object'),
    budget text check (budget is null or (json_valid(budget) and json_type(budget) = 'object')),
    conditions text not null check (json_valid(conditions) and json_type(conditions) = 'object'),
    expires_at text,
    updated_at text not null
  ) strict`,
  'create index person_access_by_expiry on person_access (expires_at) where expires_at is not null',
  'alter table pairings add column profile_id text references profiles (id) on delete cascade',
  'alter table plugin_people add column profile_id text references profiles (id) on delete set null',
  'create index plugin_people_by_profile on plugin_people (profile_id) where profile_id is not null',
  'alter table talk_messages add column speaker_profile_id text references profiles (id) on delete set null',
  `create table access_audit (
    id text primary key,
    at text not null,
    profile_id text references profiles (id) on delete set null,
    client_id text,
    kind text not null check (kind in ('refused_scope', 'refused_condition', 'refused_budget',
      'refused_expired', 'role_changed', 'scopes_changed', 'pairing_started', 'person_revoked')),
    detail text not null check (length(detail) between 1 and 500)
  ) strict`,
  'create index access_audit_by_profile on access_audit (profile_id, at)',
  'create index access_audit_by_time on access_audit (at)',
  `create table access_requests (
    id text primary key,
    profile_id text not null references profiles (id) on delete cascade,
    kind text not null check (kind in ('area', 'device', 'model', 'budget')),
    target text check (target is null or length(target) between 1 and 200),
    note text not null check (length(note) <= 500),
    status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
    until text,
    requested_at text not null,
    decided_at text,
    decided_by text,
    check ((status = 'pending') = (decided_at is null))
  ) strict`,
  'create index access_requests_by_profile on access_requests (profile_id, requested_at)',
  "create index access_requests_pending on access_requests (requested_at) where status = 'pending'",
];

const PROFILE_ID = z.object({ id: z.string() });
const MEMBER_ON_OWNER = z.object({ id: z.string(), name: z.string() });
const POSITION = z.object({ next: z.number().int() });

function giveEveryProfileAccess(sql: Sql, now: string): number {
  return sql.run(
    'give every profile its access row',
    `insert into person_access (profile_id, role, template, scopes, conditions, updated_at)
     select p.id,
       case when exists (select 1 from clients c where c.profile_id = p.id and c.role = 'owner')
         then 'owner' else 'member' end,
       case when exists (select 1 from clients c where c.profile_id = p.id and c.role = 'owner')
         then 'owner' else 'adult' end,
       $scopes, $conditions, $now
     from profiles p
     where not exists (select 1 from person_access a where a.profile_id = p.id)`,
    { scopes: jsonText(FULL_SCOPES), conditions: jsonText(NO_CONDITIONS), now },
  );
}

function ensureAnOwner(sql: Sql): void {
  sql.run(
    'make the first profile the owner when nobody is',
    `update person_access set role = 'owner', template = 'owner'
     where profile_id = (select id from profiles order by position, created_at, id limit 1)
       and not exists (select 1 from person_access where role = 'owner')`,
  );
}

function ownerProfileId(sql: Sql): string | undefined {
  return sql.get(
    PROFILE_ID,
    `select p.id from profiles p join person_access a on a.profile_id = p.id
     where a.role = 'owner'
     order by (select count(*) from clients c where c.profile_id = p.id and c.built_in = 1) desc,
       p.position, p.created_at, p.id
     limit 1`,
  )?.id;
}

function movePersonalMembers(sql: Sql, now: string): number {
  const members = sql.all(
    MEMBER_ON_OWNER,
    `select c.id, c.name from clients c join person_access a on a.profile_id = c.profile_id
     where c.role = 'member' and a.role = 'owner' order by c.created_at, c.id`,
  );
  let next =
    sql.get(POSITION, 'select coalesce(max(position), -1) + 1 as next from profiles')?.next ?? 0;
  for (const member of members) {
    const id = randomUUID();
    sql.run(
      'give the member device its own person',
      `insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at)
       values ($id, $name, $colour, $goals, $position, $now, $now)`,
      {
        id,
        name: member.name.trim().slice(0, PROFILE_NAME_LONGEST),
        colour: NEW_PERSON_COLOUR,
        goals: jsonText(UNSET_FITNESS_GOALS),
        position: next,
        now,
      },
    );
    next += 1;
    sql.run(
      'give the new person a member access row',
      `insert into person_access (profile_id, role, template, scopes, conditions, updated_at)
       values ($id, 'member', 'adult', $scopes, $conditions, $now)`,
      { id, scopes: jsonText(FULL_SCOPES), conditions: jsonText(NO_CONDITIONS), now },
    );
    sql.run('move the member device', 'update clients set profile_id = $id where id = $clientId', {
      id,
      clientId: member.id,
    });
  }
  return members.length;
}

function mapDiscordOwner(sql: Sql): number {
  const owner = ownerProfileId(sql);
  if (owner === undefined) {
    return 0;
  }
  return sql.run(
    'map the Discord owner to the owner person',
    "update plugin_people set profile_id = $owner where status = 'owner' and profile_id is null",
    { owner },
  );
}

export function backfillPersonAccess(sql: Sql, now: string): LogPayload {
  const people = giveEveryProfileAccess(sql, now);
  ensureAnOwner(sql);
  const moved = movePersonalMembers(sql, now);
  const mapped = mapDiscordOwner(sql);
  return { people, movedMemberDevices: moved, mappedDiscordOwners: mapped };
}
