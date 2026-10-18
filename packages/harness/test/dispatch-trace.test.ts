import {
  DSH_SESSION_ID,
  type HarnessRuntimeReceipt,
  type HarnessRuntimeRequest,
} from '@smarteverything/domain';
import { Logger, type LogRecord } from '@smarteverything/logging';
import { afterEach, describe, expect, it } from 'vitest';
import { epochMismatch, traced } from '../src/process/dispatch-trace';

const INTERRUPT: HarnessRuntimeRequest = {
  kind: 'interrupt',
  session_id: DSH_SESSION_ID.parse('session-1'),
  expected_epoch: 3,
};

function capture(): LogRecord[] {
  const records: LogRecord[] = [];
  Logger.configure({ level: 'trace', sink: (record) => records.push(record) });
  return records;
}

describe('dispatch tracing', () => {
  afterEach(() => {
    Logger.reset();
  });

  it('logs the start and the finish of a control with its session and epoch', async () => {
    const records = capture();
    const receipt: HarnessRuntimeReceipt = {
      operation_id: '6f1c2f6e-5d0b-4c8e-9f50-1d2f3a4b5c6d',
      session_id: DSH_SESSION_ID.parse('session-1'),
      epoch: 3,
      state: 'completed',
      durable_seq: 0,
    };

    await expect(traced('request-1', INTERRUPT, () => Promise.resolve(receipt))).resolves.toBe(
      receipt,
    );

    expect(records.map((record) => record.event)).toStrictEqual([
      'dispatch.started',
      'dispatch.finished',
    ]);
    expect(records[1]?.payload).toMatchObject({
      request_id: 'request-1',
      kind: 'interrupt',
      session_id: 'session-1',
      expected_epoch: 3,
      state: 'completed',
    });
  });

  it('logs the cause of a failed control and rethrows it unchanged', async () => {
    const records = capture();
    const failure = new Error('writer lost');

    await expect(traced('request-2', INTERRUPT, () => Promise.reject(failure))).rejects.toBe(
      failure,
    );

    const failed = records.find((record) => record.event === 'dispatch.failed');
    expect(failed?.level).toBe('error');
    expect(failed?.payload).toMatchObject({ request_id: 'request-2', session_id: 'session-1' });
  });

  it('warns only when the held epoch differs from the expected one', () => {
    const records = capture();

    epochMismatch('request-3', INTERRUPT, 3);
    expect(records).toHaveLength(0);

    epochMismatch('request-3', INTERRUPT, 4);
    expect(records.map((record) => record.event)).toStrictEqual(['dispatch.epoch_mismatch']);
    expect(records[0]?.payload).toMatchObject({ expected_epoch: 3, held_epoch: 4 });
  });
});
