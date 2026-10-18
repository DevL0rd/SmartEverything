import { DatabaseSync } from 'node:sqlite';
import { Logger, assertEventName } from '@smarteverything/logging';
import { afterEach, describe, expect, it } from 'vitest';
import { reportedSql } from '../../src/store/sql-report';
import { captureLogs } from '../support/logs';

afterEach(() => {
  Logger.reset();
});

describe('store sql reporting', () => {
  it('traces writes by table and warns when a transaction rolls back', () => {
    const logs = captureLogs();
    Logger.configure({ level: 'trace' });
    const database = new DatabaseSync(':memory:');
    database.exec('create table things (id integer primary key, name text)');
    const { sql, stop } = reportedSql(database, new Logger('hub.store'));

    sql.run('add', 'insert into things (name) values ($name)', { name: 'a' });
    expect(() =>
      sql.transaction(() => {
        sql.run('add', 'insert into things (name) values ($name)', { name: 'b' });
        throw new Error('stop');
      }),
    ).toThrow('stop');
    stop();

    const events = logs.records.map((record) => record.event);
    expect(events).toContain('store.statement_ran');
    expect(events).toContain('store.transaction_rolled_back');
    expect(
      logs.records.find((record) => record.event === 'store.statement_ran')?.payload,
    ).toMatchObject({ table: 'things', changes: 1 });
    for (const event of events) assertEventName(event);
  });
});
