import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PAUSE_MS, PAUSE_CHOICES_MS } from '@smarteverything/domain';
import { z } from 'zod';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-18T09:00:00.000Z';
const ROWS = z.array(z.record(z.string(), z.unknown()));

let database: DatabaseSync;

function upTo(version: number): void {
  migrate(
    new Sql(database),
    MIGRATIONS.filter((migration) => migration.version <= version),
    NOW,
    testLogger(),
  );
}

function pauses(): unknown[] {
  return ROWS.parse(
    database.prepare('select end_of_speech_pause_ms as ms from settings').all(),
  ).map((row) => row['ms']);
}

beforeEach(() => {
  captureLogs();
  database = new DatabaseSync(':memory:');
});

afterEach(() => {
  database.close();
});

function insertHome(): void {
  database.exec(
    `insert or ignore into settings (id, home_name, updated_at) values (1, 'Home', '${NOW}')`,
  );
}

describe('the end-of-speech pause column', () => {
  it('gives a new home Automatic', () => {
    upTo(114);
    insertHome();
    expect(DEFAULT_PAUSE_MS).toBe(0);
    expect(pauses()).toEqual([0]);
  });

  it('moves a stored 200 ms to Automatic', () => {
    upTo(113);
    insertHome();
    database.exec('update settings set end_of_speech_pause_ms = 200');
    upTo(114);
    expect(pauses()).toEqual([0]);
  });

  it.each([320, 640, 1000, 2500])('leaves an explicit %d ms alone', (stored) => {
    upTo(113);
    insertHome();
    database.exec(`update settings set end_of_speech_pause_ms = ${String(stored)}`);
    upTo(114);
    expect(pauses()).toEqual([stored]);
  });

  it.each([200, 640])('ends a database below 103 holding %d ms as it always did', (stored) => {
    upTo(102);
    insertHome();
    upTo(103);
    database.exec(`update settings set end_of_speech_pause_ms = ${String(stored)}`);
    upTo(114);
    expect(pauses()).toEqual([stored === 200 ? 0 : stored]);
  });

  it('gives a database below 103 with a home Automatic after 114', () => {
    upTo(102);
    insertHome();
    upTo(114);
    expect(pauses()).toEqual([0]);
  });

  it('keeps the rest of the settings row', () => {
    upTo(113);
    insertHome();
    upTo(114);
    expect(ROWS.parse(database.prepare('select home_name from settings').all())).toEqual([
      { home_name: 'Home' },
    ]);
  });

  it('accepts only the pauses the apps offer', () => {
    upTo(114);
    insertHome();
    for (const choice of PAUSE_CHOICES_MS) {
      database.exec(`update settings set end_of_speech_pause_ms = ${String(choice)}`);
      expect(pauses()).toEqual([choice]);
    }
    expect(() => {
      database.exec('update settings set end_of_speech_pause_ms = 500');
    }).toThrow();
  });
});
