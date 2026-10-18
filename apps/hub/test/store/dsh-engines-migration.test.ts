import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ENGINE } from '@smarteverything/domain';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { meteredRouteId } from '../../src/openrouter/metered-engine';
import { Sql } from '../../src/store/sql';
import { openStore } from '../../src/store/store';
import { testLogger } from '../support/logs';

const NOW = '2026-10-17T09:00:00.000Z';
const PROFILE = '0e000000-0000-4000-8000-0000000000f1';
const FULL = '0e000000-0000-4000-8000-0000000000c1';
const NAMED_MODEL = '0e000000-0000-4000-8000-0000000000c2';
const PLAIN_MODEL = '0e000000-0000-4000-8000-0000000000c3';
const UNOFFERED = '0e000000-0000-4000-8000-0000000000c4';
const OFFERED = '0e000000-0000-4000-8000-0000000000c5';
const ENGINE_ROW = z.object({ engine: z.string() });

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-dsh-engines-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function dshEngine(permission: unknown): string {
  return JSON.stringify({
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: null,
    model_route_id: meteredRouteId(PROFILE),
    model: 'openai/gpt-6-luna',
    effort: null,
    permission,
  });
}

function seedBefore(): void {
  const database = new DatabaseSync(path);
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= 92),
    NOW,
    testLogger(),
  );
  const run = (sql: string, ...values: string[]): void => {
    database.prepare(sql).run(...values);
  };
  run(
    "insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values (?, 'Ann', 'amber', '{}', 0, ?, ?)",
    PROFILE,
    NOW,
    NOW,
  );
  run(
    `insert into ai_models (id, provider, name, author, author_name, family, description, created, context_length,
       max_output, input_modalities, output_modalities, supported_parameters, reasoning, efforts, tools, pricing, kinds, synced_at)
     values ('plain/model', 'openrouter', 'Plain', 'plain', 'Plain', 'plain', '', ?, 1000, 1000, '[]', '[]', '[]', 'none', '[]', 1, '{}', '["chat"]', ?)`,
    NOW,
    NOW,
  );
  const chat = (id: string, engine: string): void => {
    run(
      "insert into ai_chats (id, profile_id, kind, title, engine, pinned, created_at, updated_at) values (?, ?, 'chat', 'Home', ?, 0, ?, ?)",
      id,
      PROFILE,
      engine,
      NOW,
      NOW,
    );
  };
  chat(FULL, JSON.stringify({ kind: 'openrouter', model: null, effort: null, worker_id: null }));
  chat(NAMED_MODEL, JSON.stringify({ kind: 'openrouter', model: 'openai/gpt-5', effort: 'high' }));
  chat(PLAIN_MODEL, JSON.stringify({ kind: 'openrouter', model: 'plain/model', effort: 'high' }));
  chat(UNOFFERED, dshEngine({ sandbox: 'danger-full-access', approval: 'on-request' }));
  chat(OFFERED, dshEngine({ sandbox: 'read-only', approval: 'on-request' }));
  database.close();
}

function engines(): Record<string, unknown> {
  const database = new DatabaseSync(path);
  const rows = z
    .array(ENGINE_ROW.extend({ id: z.string() }))
    .parse(database.prepare('select id, engine from ai_chats').all());
  database.close();
  return Object.fromEntries(rows.map((row) => [row.id, JSON.parse(row.engine)]));
}

describe('migrating a database that still has chats on the retired hub engine', () => {
  it('turns every openrouter chat into an unopened native chat on the hub with the metered route', () => {
    seedBefore();

    openStore({ path, log: testLogger(), now: () => new Date(NOW), systemTimeZone: 'UTC' }).close();

    const stored = engines();
    for (const id of [FULL, NAMED_MODEL, PLAIN_MODEL]) {
      expect(ENGINE.parse(stored[id])).toMatchObject({
        kind: 'dsh',
        execution_target: { kind: 'server' },
        session_id: null,
        model_route_id: meteredRouteId(PROFILE),
        permission: { sandbox: 'danger-full-access', approval: 'never' },
      });
    }
  });

  it('keeps the model the chat had and uses the default model for a chat without one', () => {
    seedBefore();

    openStore({ path, log: testLogger(), now: () => new Date(NOW), systemTimeZone: 'UTC' }).close();

    const stored = engines();
    expect(stored[NAMED_MODEL]).toMatchObject({ model: 'openai/gpt-5', effort: 'high' });
    expect(stored[FULL]).toMatchObject({ model: 'openai/gpt-6-luna', effort: 'low' });
  });

  it('drops the effort of a model that does not reason', () => {
    seedBefore();

    openStore({ path, log: testLogger(), now: () => new Date(NOW), systemTimeZone: 'UTC' }).close();

    expect(engines()[PLAIN_MODEL]).toMatchObject({ model: 'plain/model', effort: null });
  });

  it('tightens a stored permission no host offers and leaves an offered one alone', () => {
    seedBefore();

    openStore({ path, log: testLogger(), now: () => new Date(NOW), systemTimeZone: 'UTC' }).close();

    const stored = engines();
    expect(stored[UNOFFERED]).toMatchObject({
      permission: { sandbox: 'workspace-write', approval: 'on-request' },
    });
    expect(stored[OFFERED]).toMatchObject({
      permission: { sandbox: 'read-only', approval: 'on-request' },
    });
  });
});
