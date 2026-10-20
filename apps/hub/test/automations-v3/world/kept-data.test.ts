import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AutomationV3, FlowNode, FunctionV3 } from '@smarteverything/domain';
import type { EffectRequest } from '@smarteverything/flow/interpret/frames';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectHandlers } from '../../../src/automations/engine-v3-effects';
import type { EffectRun } from '../../../src/automations/effects/effect-run';
import { pruneKeptData } from '../../../src/automations/kept-data-prune';
import type { FunctionDefinitions } from '../../../src/automations/kept-data-prune';
import type { KeptKey, KeptReset } from '../../../src/automations/world-v3/kept-data';
import { KeptData } from '../../../src/automations/world-v3/kept-data';
import { StoreContext } from '../../../src/store/context';
import { ChangeFeed } from '../../../src/store/feed';
import { migrate } from '../../../src/store/migrate';
import { MIGRATIONS } from '../../../src/store/migrations';
import { AutomationNodeStateRepository } from '../../../src/store/repositories/automation-node-state';
import { AutomationValuesRepository } from '../../../src/store/repositories/automation-values';
import { ScenesRepository } from '../../../src/store/repositories/scenes';
import { Sql } from '../../../src/store/sql';
import { captureLogs, testLogger } from '../../support/logs';

const NOW = '2026-10-19T09:00:00.000Z';
const FIRST = '3a000000-0000-4000-8000-000000000001';
const SECOND = '3a000000-0000-4000-8000-000000000002';
const ONE = '3c000000-0000-4000-8000-000000000001';
const TWO = '3c000000-0000-4000-8000-000000000002';
const INNER = '3c000000-0000-4000-8000-000000000003';
const NUMBER = { t: 'number' } as const;

let folder = '';
let database: DatabaseSync;
let rows: AutomationNodeStateRepository;
let context: StoreContext;
let resets: KeptReset[] = [];

function open(): void {
  database = new DatabaseSync(join(folder, 'hub.db'), { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => new Date(NOW));
  rows = new AutomationNodeStateRepository(context);
}

function kept(): KeptData {
  return new KeptData({ rows, reset: (reset) => resets.push(reset) });
}

function key(automationId: string, instance: string): KeptKey {
  return { automationId, instance, name: 'count', type: NUMBER };
}

beforeEach(() => {
  captureLogs();
  resets = [];
  folder = mkdtempSync(join(tmpdir(), 'kept-data-'));
  open();
  for (const id of [FIRST, SECOND]) {
    database
      .prepare(
        'insert into automations (id, name, enabled, definition, run_count, created_at, updated_at) values (?, ?, 1, ?, 0, ?, ?)',
      )
      .run(id, `Automation ${id.slice(-1)}`, '{"when":[],"steps":[]}', NOW, NOW);
  }
});

afterEach(() => {
  database.close();
  rmSync(folder, { recursive: true, force: true });
});

describe('data a Custom Node keeps per instance', () => {
  it('never shares data between two instances or two automations', () => {
    const store = kept();
    store.write(key(FIRST, ONE), 1);
    store.write(key(FIRST, TWO), 2);
    store.write(key(SECOND, ONE), 3);
    expect(store.read(key(FIRST, ONE))?.value).toBe(1);
    expect(store.read(key(FIRST, TWO))?.value).toBe(2);
    expect(store.read(key(SECOND, ONE))?.value).toBe(3);
    expect(store.read(key(SECOND, TWO))).toBeUndefined();
  });

  it('keeps the data through a hub restart', () => {
    kept().write(key(FIRST, ONE), 41);
    kept().write(key(FIRST, ONE), 42);
    database.close();
    open();
    expect(kept().read(key(FIRST, ONE))).toEqual({ value: 42, revision: 2 });
  });

  it('writes nothing when the change fails', async () => {
    const store = kept();
    store.write(key(FIRST, ONE), 'not a number');
    const handlers = effectHandlers(portsWith(store));
    const change = handlers['var.change'];
    const params = {
      source: 'automation',
      target: 'count',
      change: { op: 'multiply', edge: 'wrap', amount: 2 },
      instance: ONE,
      type: { t: 'text' },
      initial: '',
    };
    const result = await change?.(params, REQUEST, runOf(FIRST));
    expect(result?.ok).toBe(false);
    expect(store.read({ ...key(FIRST, ONE), type: { t: 'text' } })).toEqual({
      value: 'not a number',
      revision: 1,
    });
  });

  it('starts from the start value and writes through the effect for an instance', async () => {
    const store = kept();
    const change = effectHandlers(portsWith(store))['var.change'];
    const params = {
      source: 'automation',
      target: 'count',
      change: { op: 'add', edge: 'wrap', amount: 1 },
      instance: TWO,
      type: NUMBER,
      initial: 10,
    };
    const result = await change?.(params, REQUEST, runOf(SECOND));
    expect(result).toMatchObject({ ok: true, value: { value: 11, previous: 10 } });
    expect(store.read(key(SECOND, TWO))?.value).toBe(11);
    expect(store.read(key(FIRST, TWO))).toBeUndefined();
  });

  it('keeps data that still fits a changed kind and resets data that does not, with a message', () => {
    const store = kept();
    store.write(key(FIRST, ONE), 5);
    const optional = { ...key(FIRST, ONE), type: { t: 'optional', of: NUMBER } as const };
    expect(store.read(optional)?.value).toBe(5);
    const text = { ...key(FIRST, ONE), type: { t: 'text' } as const };
    expect(store.read(text)).toBeUndefined();
    store.write(text, 'fresh');
    expect(resets).toEqual([
      {
        automationId: FIRST,
        instance: ONE,
        name: 'count',
        message:
          'The Custom Node data "count" started again from its start value: it held number and the Custom Node now keeps text.',
      },
    ]);
    expect(store.read(text)?.value).toBe('fresh');
  });

  it('removes only the data of an instance that was deleted, nested ones included', () => {
    const store = kept();
    store.write(key(FIRST, ONE), 1);
    store.write(key(FIRST, TWO), 2);
    store.write(key(FIRST, `${TWO}/${INNER}`), 3);
    store.write(key(SECOND, ONE), 4);
    rows.save({ automationId: FIRST, nodeId: TWO, partition: 'read', state: { seen: 1 } });
    const removed = pruneKeptData(
      { automationNodeState: rows, automationFunctions: functionsWith(caller([])) },
      FIRST,
      automationWith([callNode(ONE)]),
    );
    expect(removed).toBe(2);
    expect(store.read(key(FIRST, ONE))?.value).toBe(1);
    expect(store.read(key(FIRST, TWO))).toBeUndefined();
    expect(store.read(key(FIRST, `${TWO}/${INNER}`))).toBeUndefined();
    expect(store.read(key(SECOND, ONE))?.value).toBe(4);
    expect(rows.get(FIRST, TWO, 'read')).toBeDefined();
  });

  it('keeps nested data while the inner instance still exists', () => {
    const store = kept();
    store.write(key(FIRST, `${ONE}/${INNER}`), 3);
    const removed = pruneKeptData(
      { automationNodeState: rows, automationFunctions: functionsWith(caller([callNode(INNER)])) },
      FIRST,
      automationWith([callNode(ONE)]),
    );
    expect(removed).toBe(0);
    expect(store.read(key(FIRST, `${ONE}/${INNER}`))?.value).toBe(3);
  });
});

const REQUEST: EffectRequest = {
  kind: 'var.change',
  node: { id: ONE, key: 'bump' },
  path: '',
  activation: 'a',
  key: 'k',
  params: {},
  retry: 'idempotent',
  budget: 'none',
};

function runOf(automationId: string): EffectRun {
  return {
    runId: 'run',
    automationId,
    signal: new AbortController().signal,
    commands: (): void => undefined,
    trigger: null,
  };
}

function unused(): never {
  throw new Error('not used by this test');
}

function portsWith(store: KeptData): Parameters<typeof effectHandlers>[0] {
  return {
    setter: { set: unused },
    http: { request: unused },
    toggler: { toggle: unused },
    issuer: { issue: unused },
    store: {
      automationValues: new AutomationValuesRepository(context),
      scenes: new ScenesRepository(context),
    },
    owned: { list: unused, write: unused },
    kept: store,
    extra: {},
  };
}

function callNode(id: string): FlowNode {
  return { id, key: `use${id.slice(-1)}`, kind: 'fn.call', ports: { fn: { lit: 'counter' } } };
}

function automationWith(nodes: readonly FlowNode[]): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    body: { nodes: [...nodes] },
    policy: { mode: 'single' },
  };
}

function caller(nodes: readonly FlowNode[]): FunctionV3 {
  return {
    version: 3,
    kind: 'function',
    flavour: 'action',
    inputs: [],
    outputs: [],
    exits: ['done'],
    variables: [{ name: 'count', type: NUMBER, initial: { lit: 0 }, persist: true }],
    body: { nodes: [...nodes] },
  };
}

function functionsWith(definition: FunctionV3): FunctionDefinitions {
  return {
    find: (id: string) => (id === 'counter' ? { id } : undefined),
    findRevision: () => undefined,
    latest: () => ({ definition }),
  };
}
