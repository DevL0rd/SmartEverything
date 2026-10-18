import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Sql, allOf, inList, type SqlFilter } from '../../src/store/sql';

const ROW = z.object({ id: z.string() });

let database: DatabaseSync;
let sql: Sql;

function idsOf(filter: SqlFilter): string[] {
  return sql
    .all(ROW, `select id from things where ${filter.text} order by id`, filter.parameters)
    .map((row) => row.id);
}

beforeEach(() => {
  database = new DatabaseSync(':memory:');
  sql = new Sql(database);
  database.exec('create table things (id text primary key, kind text not null) strict');
  for (let index = 0; index < 1200; index += 1) {
    database
      .prepare('insert into things (id, kind) values (?, ?)')
      .run(`t${String(index).padStart(4, '0')}`, index % 2 === 0 ? 'even' : 'odd');
  }
});

afterEach(() => {
  database.close();
});

describe('inList', () => {
  it('matches nothing for an empty list', () => {
    expect(idsOf(inList('id', 'ids', []))).toStrictEqual([]);
  });

  it('matches exactly the one value', () => {
    expect(idsOf(inList('id', 'ids', ['t0007']))).toStrictEqual(['t0007']);
  });

  it('matches a thousand values through one parameter', () => {
    const wanted = Array.from(
      { length: 1000 },
      (_unused, index) => `t${String(index).padStart(4, '0')}`,
    );
    const filter = inList('id', 'ids', wanted);
    expect(Object.keys(filter.parameters)).toStrictEqual(['ids']);
    expect(idsOf(filter)).toStrictEqual(wanted);
  });

  it('keeps quotes and commas in values as plain text', () => {
    expect(idsOf(inList('id', 'ids', ["t0001', 't0002"]))).toStrictEqual([]);
  });
});

describe('allOf', () => {
  it('joins the filters and merges their parameters', () => {
    const filter = allOf([
      inList('id', 'ids', ['t0000', 't0001', 't0002']),
      { text: 'kind = $kind', parameters: { kind: 'even' } },
    ]);
    expect(idsOf(filter)).toStrictEqual(['t0000', 't0002']);
  });
});
