import { mkdtemp, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { backfillPersonAccess } from '../../src/store/migrations/person-access';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-18T09:00:00.000Z';
const VERSION = MIGRATIONS.find((migration) => migration.name === 'person_access')?.version ?? 0;
const BEFORE = VERSION - 1;
const ROWS = z.array(z.record(z.string(), z.unknown()));

let directory: string;
let database: DatabaseSync;

beforeEach(async () => {
  captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'hub-person-access-'));
  database = new DatabaseSync(join(directory, 'hub.db'), { enableForeignKeyConstraints: true });
});

afterEach(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

function upTo(version: number): void {
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= version),
    NOW,
    testLogger(),
  );
}

function rows(sql: string): Record<string, unknown>[] {
  return ROWS.parse(database.prepare(sql).all());
}

function firstProfile(): string {
  return z.string().parse(rows('select id from profiles order by position')[0]?.['id']);
}

function profile(id: string, name: string, position: number): void {
  database
    .prepare(
      "insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values (?, ?, 'rose', '{}', ?, ?, ?)",
    )
    .run(id, name, position, NOW, NOW);
}

interface FixtureClient {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly profileId: string;
  readonly builtIn?: number;
}

function client({ id, name, role, profileId, builtIn = 0 }: FixtureClient): void {
  database
    .prepare(
      "insert into clients (id, name, platform, role, built_in, token_hash, profile_id, created_at) values (?, ?, 'android', ?, ?, ?, ?, ?)",
    )
    .run(id, name, role, builtIn, `hash-${id}`, profileId, NOW);
}

function discordOwner(): void {
  database
    .prepare(
      "insert into plugins (id, manifest, source, enabled, trusted, status, installed_at, updated_at) values ('discord', '{}', 'builtin', 1, 1, 'running', ?, ?)",
    )
    .run(NOW, NOW);
  database
    .prepare(
      "insert into plugin_people (plugin_id, external_id, name, status, created_at, updated_at) values ('discord', '1', 'Owner', 'owner', ?, ?), ('discord', '2', 'Friend', 'approved', ?, ?)",
    )
    .run(NOW, NOW, NOW, NOW);
}

function access(): Record<string, unknown>[] {
  return rows(
    'select p.name, a.role, a.template from person_access a join profiles p on p.id = a.profile_id order by p.position',
  );
}

function expectSound(): void {
  expect(rows('pragma foreign_key_check')).toStrictEqual([]);
}

describe('person access migration', () => {
  it('leaves the live shape untouched: one profile, owner devices, one Discord owner', () => {
    upTo(BEFORE);
    const me = firstProfile();
    client({ id: 'c1', name: 'This computer', role: 'owner', profileId: me, builtIn: 1 });
    for (const id of ['c2', 'c3', 'c4', 'c5']) {
      client({ id, name: `Phone ${id}`, role: 'owner', profileId: me });
    }
    discordOwner();
    upTo(VERSION);
    expect(access()).toStrictEqual([{ name: 'Me', role: 'owner', template: 'owner' }]);
    expect(rows('select distinct profile_id from clients')).toStrictEqual([{ profile_id: me }]);
    expect(rows('select count(*) as n from profiles')).toStrictEqual([{ n: 1 }]);
    expect(
      rows('select external_id, profile_id from plugin_people order by external_id'),
    ).toStrictEqual([
      { external_id: '1', profile_id: me },
      { external_id: '2', profile_id: null },
    ]);
    expect(
      JSON.parse(String(rows('select scopes from person_access')[0]?.['scopes'])),
    ).toMatchObject({
      devices: { mode: 'all' },
      channels: { mode: 'all' },
    });
    expectSound();
  });

  it('moves a member device found on the owner profile to a new person named after it', () => {
    upTo(BEFORE);
    const me = firstProfile();
    client({ id: 'c1', name: 'This computer', role: 'owner', profileId: me, builtIn: 1 });
    client({ id: 'c2', name: `Kid phone ${'x'.repeat(60)}`, role: 'member', profileId: me });
    profile('p-sam', 'Sam', 5);
    client({ id: 'c3', name: 'Sam phone', role: 'member', profileId: 'p-sam' });
    upTo(VERSION);
    const moved = rows("select profile_id from clients where id = 'c2'")[0]?.['profile_id'];
    expect(moved).not.toBe(me);
    expect(rows(`select name, position from profiles where id = '${String(moved)}'`)).toStrictEqual(
      [{ name: `Kid phone ${'x'.repeat(30)}`, position: 6 }],
    );
    expect(
      rows("select profile_id from clients where id in ('c1', 'c3') order by id"),
    ).toStrictEqual([{ profile_id: me }, { profile_id: 'p-sam' }]);
    expect(access().map((row) => row['role'])).toStrictEqual(['owner', 'member', 'member']);
    expectSound();
  });

  it('promotes the first profile when no owner device exists and moves members off it', () => {
    upTo(BEFORE);
    const me = firstProfile();
    client({ id: 'c1', name: 'Tablet', role: 'member', profileId: me });
    upTo(VERSION);
    expect(access()).toStrictEqual([
      { name: 'Me', role: 'owner', template: 'owner' },
      { name: 'Tablet', role: 'member', template: 'adult' },
    ]);
    expect(rows("select profile_id from clients where id = 'c1'")).not.toStrictEqual([
      { profile_id: me },
    ]);
    expectSound();
  });

  it('is idempotent when the backfill runs again', () => {
    upTo(BEFORE);
    const me = firstProfile();
    client({ id: 'c1', name: 'This computer', role: 'owner', profileId: me, builtIn: 1 });
    client({ id: 'c2', name: 'Kid phone', role: 'member', profileId: me });
    discordOwner();
    upTo(VERSION);
    const snapshot = {
      access: rows('select * from person_access order by profile_id'),
      profiles: rows('select id from profiles order by id'),
      clients: rows('select id, profile_id from clients order by id'),
      people: rows('select external_id, profile_id from plugin_people order by external_id'),
    };
    expect(backfillPersonAccess(new Sql(database), NOW)).toStrictEqual({
      people: 0,
      movedMemberDevices: 0,
      mappedDiscordOwners: 0,
    });
    expect({
      access: rows('select * from person_access order by profile_id'),
      profiles: rows('select id from profiles order by id'),
      clients: rows('select id, profile_id from clients order by id'),
      people: rows('select external_id, profile_id from plugin_people order by external_id'),
    }).toStrictEqual(snapshot);
    expectSound();
  });

  it('stamps the rows it adds with the moment the migration runs', () => {
    upTo(BEFORE);
    const me = firstProfile();
    client({ id: 'c1', name: 'This computer', role: 'owner', profileId: me, builtIn: 1 });
    client({ id: 'c2', name: 'Kid phone', role: 'member', profileId: me });
    upTo(VERSION);
    expect(rows('select distinct updated_at from person_access')).toStrictEqual([
      { updated_at: NOW },
    ]);
  });

  it('makes the first profile the owner on a fresh install', () => {
    upTo(VERSION);
    expect(access()).toStrictEqual([{ name: 'Me', role: 'owner', template: 'owner' }]);
    expectSound();
  });

  it('keeps people when a profile is deleted and cascades its access, requests and pairings', () => {
    upTo(BEFORE);
    client({
      id: 'c1',
      name: 'This computer',
      role: 'owner',
      profileId: firstProfile(),
      builtIn: 1,
    });
    profile('p-sam', 'Sam', 5);
    upTo(VERSION);
    database
      .prepare(
        "insert into access_requests (id, profile_id, kind, note, requested_at) values ('r1', 'p-sam', 'budget', '', ?)",
      )
      .run(NOW);
    database
      .prepare(
        "insert into access_audit (id, at, profile_id, kind, detail) values ('a1', ?, 'p-sam', 'refused_scope', 'devices')",
      )
      .run(NOW);
    database
      .prepare(
        "insert into pairings (code_hash, role, expires_at, profile_id) values ('h', 'member', ?, 'p-sam')",
      )
      .run(NOW);
    database.prepare("delete from profiles where id = 'p-sam'").run();
    expect(rows('select count(*) as n from person_access')).toStrictEqual([{ n: 1 }]);
    expect(rows('select count(*) as n from access_requests')).toStrictEqual([{ n: 0 }]);
    expect(rows('select count(*) as n from pairings')).toStrictEqual([{ n: 0 }]);
    expect(rows('select profile_id from access_audit')).toStrictEqual([{ profile_id: null }]);
    expectSound();
  });
});
