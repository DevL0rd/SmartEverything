import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { openStore } from '../../src/store/store';
import { testLogger } from '../support/logs';

const NOW = '2026-10-17T09:00:00.000Z';
const COMMIT = 'b'.repeat(40);
const SKILL_URL = `https://raw.githubusercontent.com/anthropics/skills/${COMMIT}/skills/pdf/SKILL.md`;
const PLUGIN_URL = `https://raw.githubusercontent.com/anthropics/claude-plugins-official/${COMMIT}/plugins/feature-dev/.claude-plugin/plugin.json`;
const BUILTIN = z.object({ id: z.string(), enabled: z.number(), config: z.string() });
const EXTENSION = z.object({
  id: z.string(),
  kind: z.string(),
  enabled: z.number(),
  source: z.string(),
  version: z.string().nullable(),
  publisher: z.string(),
  confirmed: z.number(),
});

let directory: string;
let path: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-extensions-'));
  path = join(directory, 'hub.db');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function configuration(): string {
  const entry = (id: string, config: object, assets: readonly object[]): object => ({
    id,
    enabled: id !== 'browser',
    config,
    metadata: { skill_assets: assets },
  });
  return JSON.stringify({
    revision: 'stored',
    entries: [
      entry('skills', { claude_skills_enabled: false, coding_process_assets: ['x'] }, [
        { id: 'pdf', source: { kind: 'artifact', url: SKILL_URL } },
        { id: 'local-only', source: { kind: 'builtin', identity: 'local-only' } },
      ]),
      entry(
        'claude-plugins',
        { hook_integrities: { 'feature-dev:hooks/hooks.json': 'sha256-x' } },
        [{ id: 'feature-dev', source: { kind: 'artifact', url: PLUGIN_URL } }],
      ),
      entry('browser', {}, []),
    ],
  });
}

function seedBefore(): void {
  const database = new DatabaseSync(path);
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= 88),
    NOW,
    testLogger(),
  );
  database
    .prepare(
      "insert into harness_configuration_revisions(revision,configuration,created_at) values('stored',?,?)",
    )
    .run(configuration(), NOW);
  database.prepare("update harness_configuration_current set revision='stored'").run();
  database.close();
}

describe('migrating a schema-88 database to the skill and plugin store', () => {
  it('keeps built-in choices and turns pinned GitHub assets into git sources to fetch again', () => {
    seedBefore();

    openStore({
      path,
      log: testLogger(),
      now: () => new Date(NOW),
      systemTimeZone: 'UTC',
    }).close();

    const migrated = new DatabaseSync(path);
    const builtins = z
      .array(BUILTIN)
      .parse(migrated.prepare('select id,enabled,config from harness_builtins order by id').all());
    expect(builtins.map((row) => [row.id, row.enabled])).toEqual([
      ['browser', 0],
      ['claude-plugins', 1],
      ['skills', 1],
    ]);
    expect(builtins.find((row) => row.id === 'skills')?.config).toBe(
      JSON.stringify({ claude_skills_enabled: false }),
    );
    const rows = z
      .array(EXTENSION)
      .parse(
        migrated
          .prepare(
            'select id,kind,enabled,source,version,publisher,confirmed from harness_extensions order by id',
          )
          .all(),
      );
    expect(rows).toEqual([
      {
        id: 'plugin:feature-dev',
        kind: 'plugin',
        enabled: 1,
        source: JSON.stringify({
          kind: 'git',
          url: 'https://github.com/anthropics/claude-plugins-official',
          ref: null,
          path: 'plugins/feature-dev',
          commit: COMMIT,
        }),
        version: null,
        publisher: 'anthropics/claude-plugins-official',
        confirmed: 1,
      },
      {
        id: 'skill:pdf',
        kind: 'skill',
        enabled: 1,
        source: JSON.stringify({
          kind: 'git',
          url: 'https://github.com/anthropics/skills',
          ref: null,
          path: 'skills/pdf',
          commit: COMMIT,
        }),
        version: null,
        publisher: 'anthropics/skills',
        confirmed: 0,
      },
    ]);
    expect(
      z
        .array(z.object({ name: z.string() }))
        .parse(
          migrated
            .prepare("select name from sqlite_master where name='harness_skill_presentations'")
            .all(),
        ),
    ).toEqual([]);
    migrated.close();
  });
});
