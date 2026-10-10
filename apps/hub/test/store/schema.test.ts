import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import type { RowChange } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { openStore } from '../../src/store/store';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let logs: CapturedLogs;

beforeEach(async () => {
  logs = captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

const VERSION = z.object({ version: z.number(), name: z.string() });

describe('store schema', () => {
  it('migrates once, records the version and turns on WAL and foreign keys', () => {
    const path = join(opened.directory, 'test.db');
    const again = openStore({
      path,
      log: testLogger(),
      now: () => new Date('2026-10-09T00:00:00Z'),
      systemTimeZone: 'UTC',
    });
    again.close();
    const database = new DatabaseSync(path);
    expect(
      z.array(VERSION).parse(database.prepare('select version, name from schema_version').all()),
    ).toStrictEqual([
      { version: 1, name: 'initial' },
      { version: 2, name: 'oauth' },
    ]);
    expect({ ...database.prepare('pragma journal_mode').get() }).toStrictEqual({
      journal_mode: 'wal',
    });
    database.close();
    expect(
      logs.records
        .filter((record) => record.event === 'store.opened')
        .map((record) => record.payload),
    ).toStrictEqual([{ version: 2 }, { version: 2 }]);
  });

  it('refuses a database written by a newer server', () => {
    const path = join(opened.directory, 'test.db');
    const database = new DatabaseSync(path);
    database
      .prepare("insert into schema_version (version, name, applied_at) values (9, 'future', 'x')")
      .run();
    database.close();
    expect(() =>
      openStore({ path, log: testLogger(), now: () => new Date(), systemTimeZone: 'UTC' }),
    ).toThrow(
      'The database is at schema version 9, but this server only knows up to 2; a newer server wrote it.',
    );
  });

  it('enforces strict types, checks and foreign keys at the boundary', () => {
    const { store } = opened;
    expect(() => store.rooms.create('', 0)).toThrow(/CHECK constraint failed/);
    expect(() => store.rooms.create('x'.repeat(61), 0)).toThrow(/CHECK constraint failed/);
    store.rooms.create('Hall', 0);
    expect(() => store.rooms.create('Hall', 1)).toThrow(/UNIQUE constraint failed/);
    expect(() =>
      store.infrared.addRemote({
        blaster_id: '0d000000-0000-4000-8000-000000000001',
        name: 'TV',
        category: 'tv',
        brand: null,
      }),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('delivers changes only after a transaction commits and drops them when it rolls back', () => {
    const { store } = opened;
    const seen: RowChange[] = [];
    store.feed.subscribe((change) => seen.push(change));
    expect(() =>
      store.write(() => {
        store.rooms.create('Kitchen', 0);
        expect(seen).toStrictEqual([]);
        throw new Error('changed my mind');
      }),
    ).toThrow('changed my mind');
    expect(seen).toStrictEqual([]);
    expect(store.rooms.list()).toStrictEqual([]);
    store.write(() => {
      store.rooms.create('Kitchen', 0);
      store.rooms.create('Hall', 1);
    });
    expect(seen.map((change) => [change.table, change.operation])).toStrictEqual([
      ['rooms', 'INSERT'],
      ['rooms', 'INSERT'],
    ]);
  });

  it('keeps delivering to other listeners when one throws, and logs the failure', () => {
    const { store } = opened;
    const seen: string[] = [];
    store.feed.subscribe(() => {
      throw new Error('listener broke');
    });
    const unsubscribe = store.feed.subscribe((change) => seen.push(change.table));
    store.rooms.create('Hall', 0);
    unsubscribe();
    store.rooms.create('Attic', 0);
    expect(seen).toStrictEqual(['rooms']);
    expect(logs.events().filter((event) => event === 'change.listener_failed')).toHaveLength(2);
  });
});
