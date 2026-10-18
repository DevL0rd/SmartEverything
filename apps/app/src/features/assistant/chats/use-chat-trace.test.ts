import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Logger, type LogRecord } from '@smarteverything/logging';
import { TraceState, traceRows, type TraceRow } from './use-chat-trace';

function row(id: string, state: 'working' | 'answered', text: string): TraceRow {
  return {
    id,
    role: 'responder',
    kind: 'text',
    state,
    text,
    attachments: [],
    steps: [],
    step_states: [],
    reason_code: null,
  };
}

describe('chat trace', () => {
  const records: LogRecord[] = [];
  beforeEach(() => {
    records.length = 0;
    Logger.configure({ level: 'debug', sink: (record) => records.push(record) });
  });
  afterEach(() => {
    Logger.reset();
  });

  it('logs a message appearing and then its state change once each', () => {
    const state = new TraceState();
    traceRows('c1', [row('m1', 'working', 'a')], state, 0);
    traceRows('c1', [row('m1', 'working', 'ab')], state, 10);
    traceRows('c1', [row('m1', 'answered', 'abc')], state, 20);
    expect(records.map((record) => record.event)).toEqual([
      'message.appeared',
      'message.state_changed',
    ]);
  });

  it('summarises streaming progress instead of logging every update', () => {
    const state = new TraceState();
    traceRows('c1', [row('m1', 'working', 'a')], state, 0);
    for (let step = 1; step <= 20; step += 1) {
      traceRows('c1', [row('m1', 'working', 'a'.repeat(step + 1))], state, step * 10);
    }
    traceRows('c1', [row('m1', 'working', 'a'.repeat(30))], state, 3500);
    expect(records.filter((record) => record.event === 'stream.progress')).toHaveLength(1);
  });
});
