import { randomUUID } from 'node:crypto';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { Logger } from '@smarteverything/logging';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEBUG_LOG_DATA_LIMIT,
  DEBUG_LOG_EVENT,
  DEBUG_LOG_MESSAGE_LIMIT,
  debugLogHandler,
} from '../../../src/automations/effects/debug-log';
import { captureLogs, type CapturedLogs } from '../../support/logs';
import { closeSetups, lit, node, program, rigV3 } from '../support/rig-v3';
import { testRun, type TestRun } from './support';

afterEach(async () => {
  Logger.reset();
  await closeSetups();
});

function request(params: EffectRequest['params']): EffectRequest {
  return {
    kind: 'debug.log',
    node: { id: randomUUID(), key: 'shout' },
    path: 'body/ops/0',
    activation: 'f0:0',
    key: 'k',
    params,
    retry: 'idempotent',
    budget: 'effects',
  };
}

interface Logged {
  readonly logs: CapturedLogs;
  readonly run: TestRun;
  readonly asked: EffectRequest;
  readonly result: NodeResult;
}

async function logged(params: EffectRequest['params']): Promise<Logged> {
  const logs = captureLogs();
  const run = testRun();
  const asked = request(params);
  const result = await debugLogHandler(new Logger('hub.automations'))(params, asked, run);
  return { logs, run, asked, result };
}

describe('debug.log effect', () => {
  it('writes one line tagged with the run and the node and succeeds', async () => {
    const { logs, run, asked, result } = await logged({ message: 'hello', data: { n: 1 } });
    expect(result).toStrictEqual({ ok: true, value: {} });
    expect(logs.records).toHaveLength(1);
    expect(logs.records[0]).toMatchObject({
      level: 'info',
      event: DEBUG_LOG_EVENT,
      payload: {
        runId: run.runId,
        automationId: run.automationId,
        nodeId: asked.node.id,
        nodeKey: 'shout',
        message: 'hello',
        data: { n: 1 },
      },
    });
  });

  it('writes at the chosen level', async () => {
    expect((await logged({ message: 'm', level: 'warn' })).logs.records[0]?.level).toBe('warn');
    expect((await logged({ message: 'm', level: 'error' })).logs.records[0]?.level).toBe('error');
  });

  it('keeps secrets out of the recorded data', async () => {
    const { logs } = await logged({ message: 'm', data: { token: 'abc', fine: 1 } });
    expect(JSON.stringify(logs.records[0]?.payload)).not.toContain('abc');
  });

  it('caps a long message and says so', async () => {
    const { logs } = await logged({ message: 'x'.repeat(DEBUG_LOG_MESSAGE_LIMIT + 5) });
    expect(logs.records[0]?.payload).toMatchObject({
      messageTruncated: true,
      messageSize: DEBUG_LOG_MESSAGE_LIMIT + 5,
    });
  });

  it('leaves out oversized data and says so', async () => {
    const { logs } = await logged({ message: 'm', data: 'y'.repeat(DEBUG_LOG_DATA_LIMIT) });
    const payload = logs.records[0]?.payload;
    expect(payload).toMatchObject({ dataOmitted: true });
    expect(payload).not.toHaveProperty('data');
  });

  it('fails as invalid when the message is missing', async () => {
    const { result, logs } = await logged({});
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(logs.records).toHaveLength(0);
  });

  it('runs inside an automation and succeeds', async () => {
    const rig = await rigV3();
    const logs = captureLogs();
    const row = rig.add(
      program([node('shout', 'debug.log', { message: lit('hello'), level: lit('warn') })]),
    );
    rig.engine.sync();
    rig.engine.start(row.id, {}, null);
    await rig.until(() => rig.finished.length === 1);
    expect(rig.runs(row.id)[0]).toMatchObject({ status: 'succeeded' });
    expect(logs.records.find((record) => record.event === DEBUG_LOG_EVENT)).toMatchObject({
      level: 'warn',
      payload: { automationId: row.id, nodeKey: 'shout', message: 'hello' },
    });
  });
});
