import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readBoardLayout } from '@smarteverything/domain';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-10-17T09:00:00.000Z';
const BEFORE = 97;
const ROWS = z.array(z.object({ page: z.string(), layout: z.string(), updated_at: z.string() }));

const LEGACY = {
  wide: {
    widgets: [
      { id: 'weigh_in', span: 6, hidden: false },
      { id: 'steps', span: 4, hidden: false },
      { id: 'hidden_one', span: 4, hidden: true },
    ],
  },
  narrow: { widgets: [{ id: 'steps', span: 1, hidden: false }] },
};

const UNMAPPED = {
  wide: { widgets: [{ id: 'steps', span: 3, hidden: false }] },
  narrow: { widgets: [] },
};

const CLEAN = {
  version: 2,
  classes: {
    medium: { widgets: [{ key: 'steps', type: 'steps', size: 'L', options: { goal: 1 } }] },
  },
};

const RENAMED = {
  version: 2,
  classes: {
    compact: {
      widgets: [
        { key: 'scale', type: 'weigh-in', size: 'M', options: { days: 7 } },
        { key: 'steps', type: 'steps', size: 'S' },
      ],
    },
    expanded: {
      widgets: [
        { key: 'scale', type: 'weigh-in', size: 'M' },
        { key: 'body', type: 'body', size: 'M' },
      ],
    },
  },
};

const PAGES: Readonly<Record<string, unknown>> = {
  legacy: LEGACY,
  unmapped: UNMAPPED,
  clean: CLEAN,
  renamed: RENAMED,
  other: { goals: { steps: 9000 } },
};

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
  for (const [page, layout] of Object.entries(PAGES)) {
    database
      .prepare(
        'insert into layouts (client_id, profile_id, page, layout, updated_at) values (null, ?, ?, ?, ?)',
      )
      .run('p1', page, JSON.stringify(layout), NOW);
  }
});

afterEach(() => {
  database.close();
});

function stored(): Readonly<Record<string, unknown>> {
  const rows = ROWS.parse(
    database.prepare('select page, layout, updated_at from layouts where profile_id = ?').all('p1'),
  );
  return Object.fromEntries(rows.map((row) => [row.page, JSON.parse(row.layout)]));
}

describe('migrating stored board layouts to version 2', () => {
  it('rewrites version 1 layouts and the renamed widget type once, leaving the rest alone', () => {
    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
    const after = stored();

    expect(after['legacy']).toStrictEqual({
      version: 2,
      classes: {
        compact: { widgets: [{ key: 'steps', type: 'steps', size: 'S' }] },
        expanded: {
          widgets: [
            { key: 'weigh_in', type: 'body', size: 'M' },
            { key: 'steps', type: 'steps', size: 'S' },
          ],
        },
      },
    });
    expect(after['renamed']).toStrictEqual({
      version: 2,
      classes: {
        compact: {
          widgets: [
            { key: 'scale', type: 'body', size: 'M', options: { days: 7 } },
            { key: 'steps', type: 'steps', size: 'S' },
          ],
        },
        expanded: { widgets: [{ key: 'body', type: 'body', size: 'M' }] },
      },
    });
    expect(after['clean']).toStrictEqual(CLEAN);
    expect(after['unmapped']).toStrictEqual(UNMAPPED);
    expect(after['other']).toStrictEqual(PAGES['other']);
  });

  it('leaves every migrated layout readable as a stored version 2 layout', () => {
    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
    const after = stored();
    for (const page of ['legacy', 'renamed', 'clean']) {
      expect(readBoardLayout(after[page]).status).toBe('stored');
    }
    expect(readBoardLayout(after['unmapped']).status).toBe('invalid');
  });

  it('does not touch the update time of a layout it did not change', () => {
    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
    const times = ROWS.parse(
      database.prepare('select page, layout, updated_at from layouts').all(),
    ).map((row) => row.updated_at);
    expect(new Set(times)).toStrictEqual(new Set([NOW]));
  });
});
