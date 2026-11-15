import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Logger } from '@smarteverything/logging';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openStore } from '../../apps/hub/src/store/store.ts';
import { bundle, SERVICE_EXTERNALS } from '../build-service.ts';
import { UPDATE_ENTRY_DIRECTORY, UPDATE_ENTRY_FILES } from '../hub-install-layout.ts';
import { UPDATE_ENTRIES } from '../self-update-files.ts';

const BANNER =
  'import { createRequire as createServiceRequire } from "node:module"; const require = createServiceRequire(import.meta.url);';
const HUB_MODULES = join(import.meta.dirname, '..', '..', 'node_modules');
const BUNDLE_TIMEOUT_MS = 120_000;

let scratch = '';

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'update-entries-'));
  symlinkSync(HUB_MODULES, join(scratch, 'node_modules'), 'dir');
  for (const { entry, file } of UPDATE_ENTRIES)
    await bundle(
      {
        entry,
        file: `${UPDATE_ENTRY_DIRECTORY}/${file}`,
        external: SERVICE_EXTERNALS,
        banner: BANNER,
      },
      scratch,
    );
}, BUNDLE_TIMEOUT_MS);

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function lastLine(text: string): string {
  return text.trim().split('\n').at(-1) ?? '';
}

function createFixture(database: string): void {
  openStore({
    path: database,
    log: new Logger('tool.migration-fixture'),
    now: () => new Date(),
    systemTimeZone: 'UTC',
    drivePathOf: () => {
      throw new Error('The migration fixture opens the database without Drive paths.');
    },
  }).close();
}

function migrationCheck(database: string): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const work = join(scratch, 'work');
  mkdirSync(work, { recursive: true });
  const result = spawnSync(
    process.execPath,
    [join(scratch, UPDATE_ENTRY_DIRECTORY, UPDATE_ENTRY_FILES.migrationCheck), database, work],
    { encoding: 'utf8', cwd: scratch },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('prebuilt update entries', () => {
  it('builds all four entries into the update folder', () => {
    for (const file of Object.values(UPDATE_ENTRY_FILES))
      expect(existsSync(join(scratch, UPDATE_ENTRY_DIRECTORY, file))).toBe(true);
  });

  it('keeps the watchdog free of the hub package', () => {
    const text = readFileSync(
      join(scratch, UPDATE_ENTRY_DIRECTORY, UPDATE_ENTRY_FILES.watchdog),
      'utf8',
    );
    expect(text).not.toContain('@smarteverything/hub');
  });

  it('runs the migration check on a fixture database without touching it', () => {
    const database = join(scratch, 'fixture.sqlite');
    createFixture(database);
    const before = new DatabaseSync(database, { readOnly: true })
      .prepare('select max(version) as version from schema_version')
      .get();
    const result = migrationCheck(database);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const reply: unknown = JSON.parse(lastLine(result.stdout));
    expect(reply).toEqual({ from: before?.['version'], to: before?.['version'] });
  });

  it('exits non-zero when a newer server wrote the database', () => {
    const database = join(scratch, 'broken.sqlite');
    createFixture(database);
    const handle = new DatabaseSync(database);
    handle
      .prepare('insert into schema_version (version, name, applied_at) values (?, ?, ?)')
      .run(1_000_000, 'newer-server', '2026-11-14T00:00:00.000Z');
    handle.close();
    const result = migrationCheck(database);
    expect(result.status).not.toBe(0);
    expect(result.stderr).not.toBe('');
  });

  it('fails when the database does not exist', () => {
    expect(migrationCheck(join(scratch, 'missing.sqlite')).status).not.toBe(0);
  });
});
