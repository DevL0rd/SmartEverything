import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@smarteverything/logging';
import { TurnStream } from '../../../src/assistant/conversation/stream';
import { captureLogs, type CapturedLogs } from '../../support/logs';

let logs: CapturedLogs;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  logs = captureLogs();
});
afterEach(() => {
  vi.useRealTimers();
  Logger.reset();
});

function opened(): TurnStream {
  return new TurnStream(
    { chatId: 'chat', turnId: 'turn', messageId: 'reply', profileId: 'person' },
    () => undefined,
  );
}

const RUNNING = {
  callId: 'c1',
  name: 'bash',
  title: 'bash',
  state: 'running',
  detail: null,
} as const;

describe('the stall warning of a reply stream', () => {
  it('does not call a long tool run a stall', () => {
    const stream = opened();
    stream.text('Working');
    stream.tool(RUNNING);
    vi.advanceTimersByTime(60_000);
    stream.tool({ ...RUNNING, state: 'done' });

    expect(logs.events()).not.toContain('stream.resumed_after_stall');
  });

  it('still warns when the model goes silent between parts', () => {
    const stream = opened();
    stream.text('Working');
    vi.advanceTimersByTime(60_000);
    stream.text(' more');

    expect(logs.events()).toContain('stream.resumed_after_stall');
  });
});
