import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { Sql } from '../../src/store/sql';
import { captureLogs, testLogger } from '../support/logs';

const NOW = '2026-10-18T09:00:00.000Z';
const HASH = 'a'.repeat(64);
const AUTOMATION = '3a000000-0000-4000-8000-000000000001';
const OTHER = '3a000000-0000-4000-8000-000000000002';

let sql: Sql;
let context: StoreContext;
let clock = new Date(NOW);

function build(): void {
  captureLogs();
  clock = new Date(NOW);
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW, testLogger());
  context = new StoreContext(sql, new ChangeFeed(testLogger('store')), () => clock);
  for (const id of [AUTOMATION, OTHER])
    database
      .prepare(
        'insert into automations (id, name, enabled, definition, run_count, created_at, updated_at) values (?, ?, 1, ?, 0, ?, ?)',
      )
      .run(id, 'Lamp ' + id.slice(-1), '{"when":[],"steps":[]}', NOW, NOW);
}
import type { FlowType } from '@smarteverything/domain';
import {
  AutomationRunNodesRepository,
  PREVIEW_BYTES,
  portPreview,
  previewOfPorts,
  type RunNodeActivation,
} from '../../src/store/repositories/automation-run-nodes';
import { AutomationRunRecordsRepository } from '../../src/store/repositories/automation-run-records';

const TEXT: FlowType = { t: 'text' };
const SECRET: FlowType = { t: 'ref', of: 'secret' };

let nodes: AutomationRunNodesRepository;
let runId: string;

function N(index: number): string {
  return `3d000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function nodeOf(path: string): string {
  const segment = path.slice(path.lastIndexOf('/') + 1);
  return segment.slice(segment.indexOf('#') + 1).split('[')[0] ?? segment;
}

function activation(path: string, overrides: Partial<RunNodeActivation> = {}): RunNodeActivation {
  return {
    path,
    nodeId: nodeOf(path),
    iteration: 0,
    status: 'succeeded',
    startedAt: NOW,
    finishedAt: NOW,
    durationMs: 10,
    input: null,
    output: null,
    error: null,
    commandIds: [],
    late: false,
    ...overrides,
  };
}

beforeEach(() => {
  build();
  nodes = new AutomationRunNodesRepository(context);
  runId = new AutomationRunRecordsRepository(context, () => undefined).create({
    automationId: AUTOMATION,
    revision: 1,
    ownerProfileId: null,
    mode: 'live',
    planHash: HASH,
  }).id;
});

describe('node previews', () => {
  it('redacts a secret reference and any record that holds one', () => {
    expect(portPreview({ value: 'hunter2', type: SECRET }).value).toStrictEqual({
      $redacted: true,
    });
    const held: FlowType = { t: 'record', fields: { key: SECRET, label: TEXT } };
    expect(portPreview({ value: { key: 'hunter2', label: 'x' }, type: held }).value).toStrictEqual({
      $redacted: true,
    });
    expect(
      portPreview({ value: ['hunter2'], type: { t: 'list', of: SECRET } }).value,
    ).toStrictEqual({
      $redacted: true,
    });
  });

  it('keeps small values whole and cuts large ones to 2 KiB with the flag', () => {
    const small = previewOfPorts({ a: { value: { n: 1 }, type: { t: 'any' } } });
    expect(small).toStrictEqual({ preview: { a: { n: 1 } }, truncated: false });
    const big = previewOfPorts({
      a: { value: 'x'.repeat(5000), type: TEXT },
      b: { value: 1, type: TEXT },
    });
    expect(big.truncated).toBe(true);
    const cut = big.preview['a'];
    expect(typeof cut === 'object' && cut !== null && '$truncated' in cut).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(cut), 'utf8')).toBeLessThan(PREVIEW_BYTES + 32);
    expect(big.preview['b']).toBe(1);
  });

  it('cuts multi-byte text on a character boundary', () => {
    const cut = portPreview({ value: 'é'.repeat(3000), type: TEXT });
    expect(cut.truncated).toBe(true);
    expect(JSON.stringify(cut.value)).not.toContain('�');
  });
});

describe('automation run node records', () => {
  it('appends a slice in one batch with consecutive sequence numbers', () => {
    const first = nodes.append(runId, [activation(N(1)), activation(N(2))]);
    const second = nodes.append(runId, [activation(N(3))]);
    expect(first.map((row) => row.seq)).toStrictEqual([0, 1]);
    expect(second.map((row) => row.seq)).toStrictEqual([2]);
    expect(nodes.forRun(runId).map((row) => row.path)).toStrictEqual([N(1), N(2), N(3)]);
    expect(nodes.forRun(runId, 0, 1).map((row) => row.path)).toStrictEqual([N(2)]);
    expect(nodes.ofNode(runId, N(2))).toHaveLength(1);
  });

  it('stores redacted, truncated previews and flags the row', () => {
    const [row] = nodes.append(runId, [
      activation(N(1), {
        input: { token: { value: 'hunter2', type: SECRET } },
        output: { text: { value: 'y'.repeat(4000), type: TEXT } },
      }),
    ]);
    expect(row?.truncated).toBe(true);
    expect(JSON.stringify(row)).not.toContain('hunter2');
    expect(row?.input_preview).toStrictEqual({ token: { $redacted: true } });
  });

  it('writes nothing for an empty slice and rolls back a bad slice whole', () => {
    expect(nodes.append(runId, [])).toStrictEqual([]);
    expect(() => nodes.append(runId, [activation(N(1)), activation('')])).toThrow();
    expect(nodes.forRun(runId)).toHaveLength(0);
  });

  it('settles the latest open record of a path', () => {
    nodes.append(runId, [
      activation(N(1), { status: 'waiting', finishedAt: null, durationMs: null }),
    ]);
    const settled = nodes.settle(runId, N(1), {
      status: 'succeeded',
      finishedAt: '2026-10-18T09:00:05.000Z',
      durationMs: 5000,
      output: { v: { value: 3, type: { t: 'any' } } },
    });
    expect(settled).toBe(true);
    expect(nodes.forRun(runId)[0]).toMatchObject({
      status: 'succeeded',
      duration_ms: 5000,
      output_preview: { v: 3 },
    });
    expect(nodes.settle(runId, N(1), { status: 'failed', finishedAt: NOW, durationMs: 1 })).toBe(
      false,
    );
  });

  it('keeps the first and last 20 loop iterations and one aggregate per inner node', () => {
    const loop = `call#${N(3)}/loop#${N(7)}`;
    const batch: RunNodeActivation[] = [];
    for (let index = 0; index < 100; index += 1) {
      batch.push(
        activation(`${loop}[${String(index)}]/${N(9)}`, {
          iteration: index,
          durationMs: index === 50 ? 500 : 10,
          status: index === 60 ? 'failed' : 'succeeded',
        }),
      );
    }
    nodes.append(runId, batch);
    nodes.append(runId, [activation(N(20))]);
    expect(nodes.finishLoop(runId, loop)).toBe(60);
    const rows = nodes.forRun(runId, -1, 1000);
    const kept = rows.filter((row) => !row.path.includes('[*]') && row.path.startsWith(loop));
    expect(kept).toHaveLength(40);
    expect(kept.map((row) => row.iteration)).toStrictEqual([
      ...Array.from({ length: 20 }, (_, index) => index),
      ...Array.from({ length: 20 }, (_, index) => 80 + index),
    ]);
    const aggregate = rows.find((row) => row.path === `${loop}[*]/${N(9)}`);
    expect(aggregate?.status).toBe('failed');
    expect(aggregate?.output_preview).toStrictEqual({
      aggregate: {
        count: 60,
        succeeded: 59,
        failed: 1,
        other: 0,
        totalMs: 59 * 10 + 500 - 0,
        minMs: 10,
        maxMs: 500,
        firstIteration: 20,
        lastIteration: 79,
      },
    });
    expect(rows.some((row) => row.path === N(20))).toBe(true);
  });

  it('summarises a loop once: a second call changes nothing', () => {
    const loop = `loop#${N(7)}`;
    nodes.append(
      runId,
      Array.from({ length: 50 }, (_, index) =>
        activation(`${loop}[${String(index)}]/${N(9)}`, { iteration: index }),
      ),
    );
    expect(nodes.finishLoop(runId, loop)).toBe(10);
    const before = nodes.forRun(runId, -1, 1000);
    expect(nodes.finishLoop(runId, loop)).toBe(0);
    expect(nodes.forRun(runId, -1, 1000)).toStrictEqual(before);
  });

  it('leaves short loops whole', () => {
    nodes.append(runId, [
      activation(`loop#${N(7)}[0]/${N(9)}`),
      activation(`loop#${N(7)}[1]/${N(9)}`),
    ]);
    expect(nodes.finishLoop(runId, `loop#${N(7)}`)).toBe(0);
    expect(nodes.forRun(runId)).toHaveLength(2);
  });

  it('measures the bytes of a run and drops records with the run', () => {
    expect(nodes.bytesOfRun(runId)).toBe(0);
    nodes.append(runId, [activation(N(1), { output: { a: { value: 'zzzz', type: TEXT } } })]);
    expect(nodes.bytesOfRun(runId)).toBeGreaterThan(10);
    sql.run('remove the run', 'delete from automation_runs where id=$id', { id: runId });
    expect(nodes.forRun(runId)).toHaveLength(0);
  });
});
