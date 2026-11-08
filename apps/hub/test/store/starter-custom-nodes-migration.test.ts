import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { STARTER_NODES, STARTER_NODE_IDS } from '@smarteverything/domain';
import { interfaceHash, interfaceOf } from '@smarteverything/flow/functions/interface-hash';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { STARTER_CUSTOM_NODES_MIGRATION } from '../../src/store/migrations/starter-custom-nodes';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { AutomationFunctionsRepository } from '../../src/store/repositories/automation-functions';
import { AutomationPlansRepository } from '../../src/store/repositories/automation-plans';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-25T12:00:00.000Z';
const ROW = z.object({ id: z.string(), name: z.string() });
const OTHER = '00000000-0000-4000-8000-0000000000aa';

let database: DatabaseSync;
let sql: Sql;

beforeEach(() => {
  captureLogs();
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  sql = new Sql(database);
  migrate(
    sql,
    MIGRATIONS.filter((migration) => migration.version < STARTER_CUSTOM_NODES_MIGRATION.version),
    NOW,
    testLogger(),
  );
});

afterEach(() => {
  database.close();
});

function repositories(): {
  functions: AutomationFunctionsRepository;
  plans: AutomationPlansRepository;
} {
  const context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => new Date(NOW));
  return {
    functions: new AutomationFunctionsRepository(context),
    plans: new AutomationPlansRepository(context),
  };
}

function rows(): z.infer<typeof ROW>[] {
  return sql.all(ROW, 'select id, name from automation_functions order by id');
}

function existing(id: string, name: string): void {
  database
    .prepare(
      `insert into automation_functions (id, name, latest_revision, created_at, updated_at)
       values (?, ?, 1, ?, ?)`,
    )
    .run(id, name, NOW, NOW);
}

describe('installing the starter Custom Nodes', () => {
  it('follows the newest migration with its own version', () => {
    const versions = MIGRATIONS.map((migration) => migration.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(MIGRATIONS.at(-1)).toBe(STARTER_CUSTOM_NODES_MIGRATION);
    expect(STARTER_CUSTOM_NODES_MIGRATION.version).toBe(Math.max(...versions));
  });

  it('installs each node once as revision 1 of an ordinary Custom Node with its plan', () => {
    migrate(sql, MIGRATIONS, NOW, testLogger());
    const { functions, plans } = repositories();
    expect(rows().map((row) => row.id)).toStrictEqual(Object.values(STARTER_NODE_IDS).sort());
    for (const node of STARTER_NODES) {
      const row = functions.byId(node.id);
      expect(row).toMatchObject({ name: node.name, latest_revision: 1, created_by: null });
      const latest = functions.latest(node.id);
      expect(latest.definition).toStrictEqual(node.program);
      expect(latest.compat).toBe('compatible');
      expect(latest.interface_hash).toBe(interfaceHash(interfaceOf(node.program)));
      expect(plans.find(latest.plan_hash)?.kind).toBe('function');
      expect(Object.keys(latest.layout.nodes).length).toBe(node.program.nodes.length);
    }
  });

  it('keeps existing Custom Nodes and gives a taken name a number', () => {
    existing(OTHER, 'Wake-up light');
    migrate(sql, MIGRATIONS, NOW, testLogger());
    const names = new Map(rows().map((row) => [row.id, row.name]));
    expect(names.get(OTHER)).toBe('Wake-up light');
    expect(names.get(STARTER_NODE_IDS.wakeUpLight)).toBe('Wake-up light 2');
    expect(names.size).toBe(STARTER_NODES.length + 1);
  });

  it('changes nothing when it runs again', () => {
    migrate(sql, MIGRATIONS, NOW, testLogger());
    const before = rows();
    const outcome = sql.transaction(() => STARTER_CUSTOM_NODES_MIGRATION.backfill?.(sql, NOW));
    expect(outcome).toMatchObject({ installed: 0, present: STARTER_NODES.length });
    expect(rows()).toStrictEqual(before);
  });
});
