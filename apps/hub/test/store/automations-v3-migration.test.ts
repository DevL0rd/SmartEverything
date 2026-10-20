import { DatabaseSync } from 'node:sqlite';
import { AUTOMATION_V3, NODE_REGISTRY } from '@smarteverything/domain';
import { lower } from '@smarteverything/flow/compile/lower';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { EMPTY_AUTOMATION } from '../../src/store/migrations/automations-v3-data';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-19T21:00:00.000Z';
const BEFORE = '2026-10-01T08:00:00.000Z';
const LAMP = '5a000000-0000-4000-8000-000000000002';
const ON = '5b000000-0000-4000-8000-000000000001';
const OFF = '5b000000-0000-4000-8000-000000000002';
const SPEECH = '5b000000-0000-4000-8000-000000000003';
const FAILED_TEXT = 'The earlier run failed.';

const ROW = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.number(),
  revision: z.number(),
  definition: z.string(),
  definition_v2: z.string().nullable(),
  last_error: z.string().nullable(),
  updated_at: z.string(),
});
const COUNT = z.object({ count: z.number() });
const WATCH = z.object({ automation_id: z.string(), trigger_id: z.string() });
const SPEECH_ROW = z.object({ automation_id: z.string(), revision: z.string() });
const UP_TO_V3 = MIGRATIONS.filter((migration) => migration.version <= 130);
const RUN = z.object({ id: z.string(), legacy_trace: z.string().nullable(), revision: z.number() });

interface Seeded {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly enabled: boolean;
  readonly definition: unknown;
}

const SEEDED: readonly Seeded[] = [
  {
    id: ON,
    name: 'Lamp at sunset',
    revision: 4,
    enabled: true,
    definition: {
      when: [{ on: 'time', at: '18:30' }],
      steps: [{ do: 'set', target: { device: LAMP }, control: 'power', to: true }],
    },
  },
  {
    id: OFF,
    name: 'Paused one',
    revision: 2,
    enabled: false,
    definition: { when: [], steps: [] },
  },
  {
    id: SPEECH,
    name: 'Lights by voice',
    revision: 3,
    enabled: true,
    definition: { when: [{ on: 'speech', phrase: 'lights on' }], steps: [] },
  },
];

let database: DatabaseSync;

function rows<T>(schema: z.ZodType<T>, text: string): T[] {
  return z.array(schema).parse(database.prepare(text).all());
}

function count(text: string): number {
  return rows(COUNT, text)[0]?.count ?? -1;
}

function seed(): void {
  const insert = database.prepare(
    `insert into automations (id, name, enabled, revision, definition, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const entry of SEEDED) {
    insert.run(
      entry.id,
      entry.name,
      entry.enabled ? 1 : 0,
      entry.revision,
      JSON.stringify(entry.definition),
      BEFORE,
      BEFORE,
    );
  }
  database.prepare('update automations set last_error = ? where id = ?').run(FAILED_TEXT, OFF);
}

function seedKeptState(): void {
  database
    .prepare(
      `insert into signal_watch_state (automation_id, trigger_id, partition, last_seen_ms, period, latched)
       values (?, '#0', '', 1000, null, 0)`,
    )
    .run(ON);
  database
    .prepare(
      "insert into automation_speech_grants (automation_id, revision, principal, watermark) values (?, '3', '{}', 0)",
    )
    .run(SPEECH);
  database
    .prepare(
      `insert into automation_runs (id, automation_id, revision, status, trace, created_at)
       values ('run-1', ?, 4, 'succeeded', '[{"node":"a"}]', ?)`,
    )
    .run(ON, BEFORE);
}

function automationRows(): Map<string, z.infer<typeof ROW>> {
  const all = rows(
    ROW,
    'select id, name, enabled, revision, definition, definition_v2, last_error, updated_at from automations',
  );
  return new Map(all.map((row) => [row.id, row]));
}

beforeEach(() => {
  captureLogs();
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version < 130),
    BEFORE,
    testLogger(),
  );
});

describe('the automations migration keeps old automations for remaking', () => {
  beforeEach(() => {
    seed();
    seedKeptState();
    migrate(new Sql(database), UP_TO_V3, NOW, testLogger());
  });

  it('keeps every old definition byte for byte and converts none of them', () => {
    const migrated = automationRows();
    expect(migrated.size).toBe(SEEDED.length);
    for (const entry of SEEDED) {
      const row = migrated.get(entry.id);
      expect(row?.definition_v2).toBe(JSON.stringify(entry.definition));
      expect(AUTOMATION_V3.parse(JSON.parse(row?.definition ?? 'null'))).toStrictEqual(
        EMPTY_AUTOMATION,
      );
    }
  });

  it('turns every old automation off and leaves its name, revision and history as they were', () => {
    for (const entry of SEEDED) {
      const row = automationRows().get(entry.id);
      expect(row).toMatchObject({
        name: entry.name,
        enabled: 0,
        revision: entry.revision,
        last_error: entry.id === OFF ? FAILED_TEXT : null,
        updated_at: BEFORE,
      });
    }
  });

  it('writes no new revision and no compiled plan for an old automation', () => {
    expect(count('select count(*) as count from automation_revisions')).toBe(0);
    expect(count('select count(*) as count from automation_plans')).toBe(0);
  });

  it('leaves the kept watch state, speech grant and old runs untouched', () => {
    expect(rows(WATCH, 'select automation_id, trigger_id from signal_watch_state')).toStrictEqual([
      { automation_id: ON, trigger_id: '#0' },
    ]);
    expect(
      rows(SPEECH_ROW, 'select automation_id, revision from automation_speech_grants'),
    ).toStrictEqual([{ automation_id: SPEECH, revision: '3' }]);
    expect(rows(RUN, 'select id, legacy_trace, revision from automation_runs')).toStrictEqual([
      { id: 'run-1', legacy_trace: '[{"node":"a"}]', revision: 4 },
    ]);
  });
});

describe('the empty program an old automation holds', () => {
  it('compiles, so turning one on runs nothing and fails nothing', () => {
    const lowered = lower(EMPTY_AUTOMATION, { kinds: (id) => NODE_REGISTRY.get(id) });
    expect(lowered.ok).toBe(true);
  });

  it('migrates a home without automations to the last version', () => {
    migrate(new Sql(database), UP_TO_V3, NOW, testLogger());
    expect(automationRows().size).toBe(0);
  });
});
