import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { ATTACHMENT_LEVELS_MIGRATION } from '../../src/store/migrations/attachment-levels';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-07T09:00:00.000Z';
const PROFILE = '0e000000-0000-4000-8000-0000000000f1';
const CLIP = '0e000000-0000-4000-8000-0000000000b1';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-attachment-levels-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('attachment levels migration', () => {
  it('adds an empty levels column to the stored attachments', () => {
    const database = new DatabaseSync(join(directory, 'hub.db'));
    migrate(
      new Sql(database),
      MIGRATIONS.filter((migration) => migration.version < ATTACHMENT_LEVELS_MIGRATION.version),
      NOW,
      testLogger(),
    );
    database
      .prepare(
        "insert into profiles (id, name, colour, fitness_goals, position, created_at, updated_at) values (?, 'Ann', 'amber', '{}', 0, ?, ?)",
      )
      .run(PROFILE, NOW, NOW);
    database
      .prepare(
        "insert into assistant_attachments (id, message_id, profile_id, name, mime, bytes, width, height, storage_path, sha256, transcript, created_at) values (?, null, ?, 'a.wav', 'audio/wav', 5, null, null, 'files/a.wav', ?, null, ?)",
      )
      .run(CLIP, PROFILE, 'a'.repeat(64), NOW);
    migrate(new Sql(database), MIGRATIONS, NOW, testLogger());
    const row = z
      .object({ levels: z.string().nullable() })
      .parse(database.prepare('select levels from assistant_attachments where id = ?').get(CLIP));
    expect(row.levels).toBeNull();
    expect(() =>
      database.prepare("update assistant_attachments set levels = 'nope' where id = ?").run(CLIP),
    ).toThrow();
  });
});
