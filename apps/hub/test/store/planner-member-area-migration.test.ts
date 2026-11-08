import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { PLANNER_MEMBER_AREA_MIGRATION } from '../../src/store/migrations/planner-member-area';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T00:00:00.000Z';
const ROW = z.object({ profile_id: z.string(), scopes: z.string() });

let database: DatabaseSync;

function scopes(areas: readonly string[]): string {
  return JSON.stringify({
    areas,
    devices: { mode: 'all', rooms: [], devices: [] },
    models: { mode: 'default', ids: [] },
    channels: { mode: 'all', ids: [] },
  });
}

function person(id: string, role: 'owner' | 'member', areas: readonly string[]): void {
  database
    .prepare(
      "insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values (?, ?, 'aqua', '{}', 0, ?, ?)",
    )
    .run(id, id, NOW, NOW);
  database
    .prepare(
      "insert into person_access (profile_id, role, template, scopes, conditions, updated_at) values (?, ?, ?, ?, '{}', ?)",
    )
    .run(id, role, role === 'owner' ? 'owner' : 'adult', scopes(areas), NOW);
}

function areasOf(id: string): readonly string[] {
  const row = ROW.parse(
    database.prepare('select profile_id, scopes from person_access where profile_id = ?').get(id),
  );
  return z.object({ areas: z.array(z.string()) }).parse(JSON.parse(row.scopes)).areas;
}

beforeEach(() => {
  database = new DatabaseSync(':memory:');
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version < PLANNER_MEMBER_AREA_MIGRATION.version),
    NOW,
    testLogger(),
  );
});

afterEach(() => {
  database.close();
});

it('gives an existing member the planner once and leaves the owner and a member who has it alone', () => {
  person('owner', 'owner', ['home', 'devices']);
  person('kid', 'member', ['home', 'health']);
  person('has', 'member', ['planner', 'home']);
  migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
  expect(areasOf('kid')).toStrictEqual(['home', 'health', 'planner']);
  expect(areasOf('has')).toStrictEqual(['planner', 'home']);
  expect(areasOf('owner')).toStrictEqual(['home', 'devices']);
  migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
  expect(areasOf('kid')).toStrictEqual(['home', 'health', 'planner']);
});

it('is the next migration after the registered head with no gap', () => {
  const versions = MIGRATIONS.map((migration) => migration.version);
  expect(versions.at(-1)).toBe(PLANNER_MEMBER_AREA_MIGRATION.version);
  expect(new Set(versions).size).toBe(versions.length);
  const recent = versions.filter((version) => version >= 178);
  for (const [index, version] of recent.entries()) {
    if (index > 0) expect(version).toBe((recent[index - 1] ?? 0) + 1);
  }
});
