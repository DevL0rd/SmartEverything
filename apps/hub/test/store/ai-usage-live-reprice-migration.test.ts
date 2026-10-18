import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-10-17T09:00:00.000Z';
const BEFORE = 21;
const COST = z.object({ cost_micros: z.number() });

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= BEFORE),
    NOW,
    testLogger(),
  );
  database
    .prepare(
      "insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values ('p1', 'Ann', 'amber', '{}', 1, ?, ?)",
    )
    .run(NOW, NOW);
});

afterEach(() => {
  database.close();
});

function addLiveTurn(modelId: string): void {
  database
    .prepare(
      `insert into ai_usage (id, at, profile_id, source, work, model_id, tokens_in, tokens_out, audio_in_ms, audio_out_ms, cost_micros, cost_state)
       values ('u1', ?, 'p1', 'gemini_live', 'voice', ?, 1000, 500, 10000, 5000, 1, 'estimated')`,
    )
    .run(NOW, modelId);
}

function migrateTo(version: number): void {
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= version),
    NOW,
    testLogger(),
  );
}

describe('repricing Gemini Live turns with the shipped price table', () => {
  it('prices text and audio tokens separately', () => {
    addLiveTurn('google:gemini-3.8-live');
    migrateTo(22);
    expect(
      COST.parse(database.prepare("select cost_micros from ai_usage where id = 'u1'").get()),
    ).toStrictEqual({ cost_micros: 4920 });
  });

  it('prefers a price the owner saved over the shipped one', () => {
    addLiveTurn('google:gemini-3.8-live');
    database
      .prepare("insert into ai_settings (key, settings, updated_at) values ('openrouter', ?, ?)")
      .run(
        JSON.stringify({
          google_prices: {
            'google:gemini-3.8-live': {
              input_per_mtok: 1,
              audio_in_per_mtok: 0,
              output_per_mtok: 0,
              audio_out_per_mtok: 0,
            },
          },
        }),
        NOW,
      );
    migrateTo(22);
    expect(
      COST.parse(database.prepare("select cost_micros from ai_usage where id = 'u1'").get()),
    ).toStrictEqual({ cost_micros: 680 });
  });

  it('refuses to guess a price for a model the shipped table does not know', () => {
    addLiveTurn('google:unknown');
    expect(() => {
      migrateTo(22);
    }).toThrow(/no text and audio prices for google:unknown/);
  });
});
