import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function planOf(text: string): string {
  const database = new DatabaseSync(join(opened.directory, 'test.db'), { readOnly: true });
  try {
    return database
      .prepare(`explain query plan ${text}`)
      .all()
      .map((row) => String(row['detail']))
      .join(' ');
  } finally {
    database.close();
  }
}

it('reads the newest automation runs from the creation index without sorting every run', () => {
  const plan = planOf(
    'select id from automation_runs order by created_at desc, rowid desc limit 200',
  );
  expect(plan).toContain('automation_runs_created');
  expect(plan).not.toContain('TEMP B-TREE');
});

it('reads the runs started in a window from the creation index', () => {
  const plan = planOf(
    "select id from automation_runs where created_at >= '2026-01-01' and created_at < '2026-02-01' order by created_at, rowid",
  );
  expect(plan).toContain('automation_runs_created (created_at>? AND created_at<?)');
});

it('lists events of every kind except the excluded ones', () => {
  opened.store.events.insert([
    { deviceId: null, kind: 'button', occurredAt: '2026-10-08T09:00:00.000Z', details: {} },
    { deviceId: null, kind: 'motion', occurredAt: '2026-10-08T09:01:00.000Z', details: {} },
    { deviceId: null, kind: 'opened', occurredAt: '2026-10-08T09:02:00.000Z', details: {} },
  ]);
  const kinds = opened.store.events
    .list({ exceptKinds: ['button', 'opened'], limit: 10 })
    .map((event) => event.kind);
  expect(kinds).toStrictEqual(['motion']);
});
