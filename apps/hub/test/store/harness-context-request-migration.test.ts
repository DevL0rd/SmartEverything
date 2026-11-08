import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { JSON_VALUE } from '@smarteverything/domain';
import { HARNESS_CONTEXT_REQUEST_MIGRATION } from '../../src/store/migrations/harness-context-request';

const ROW = z.object({ session_id: z.string(), projection: z.string() });

describe('dropping the stored supplier context request', () => {
  it('removes the request from every stored projection and keeps the rest', () => {
    const database = new DatabaseSync(':memory:');
    database.exec(
      'create table harness_projections (session_id text primary key, projection text not null) strict',
    );
    const insert = database.prepare('insert into harness_projections values (?, ?)');
    insert.run(
      'with',
      JSON.stringify({
        state: 'idle',
        context: { input_tokens: 5 },
        context_request: { id: 'r', epoch: 1 },
      }),
    );
    insert.run('without', JSON.stringify({ state: 'working' }));

    for (const statement of HARNESS_CONTEXT_REQUEST_MIGRATION.statements) database.exec(statement);

    const rows = database
      .prepare('select session_id, projection from harness_projections order by session_id')
      .all()
      .map((row) => ROW.parse(row));
    expect(
      rows.map((row) => [row.session_id, JSON_VALUE.parse(JSON.parse(row.projection))]),
    ).toStrictEqual([
      ['with', { state: 'idle', context: { input_tokens: 5 } }],
      ['without', { state: 'working' }],
    ]);
  });
});
