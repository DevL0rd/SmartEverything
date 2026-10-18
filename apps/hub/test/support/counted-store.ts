import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { testLogger } from './logs';

export interface CountedStore {
  readonly context: StoreContext;
  readonly sql: Sql;
  readonly statements: () => number;
  readonly close: () => Promise<void>;
}

export async function countedStore(
  now: () => Date = () => new Date('2026-10-08T10:00:00.000Z'),
): Promise<CountedStore> {
  const directory = await mkdtemp(join(tmpdir(), 'hub-counted-'));
  const database = new DatabaseSync(join(directory, 'counted.db'), {
    enableForeignKeyConstraints: true,
  });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, now().toISOString(), testLogger('store'));
  return {
    context: new StoreContext(sql, new ChangeFeed(testLogger('store')), now),
    sql,
    statements: () => sql.totals.statements,
    close: async (): Promise<void> => {
      database.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
