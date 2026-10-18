import { describe, expect, it } from 'vitest';
import { isProjectedType, narrowNativeEvent, usageOfAssistant } from '../src/reducer/event';

const USAGE_RECORD = {
  type: 'chunk',
  time: 4,
  chunk: { type: 'usage', usage: { inputTokens: 7, outputTokens: 2 } },
};
const TEXT_RECORD = { type: 'text-chunks', time0: 1, index: 0, dt: [0], texts: ['secret reply'] };

describe('reading a stored native event', () => {
  it('knows whether it entered the model surface by appending or by replacing', () => {
    const appended = narrowNativeEvent({
      type: 'user/message',
      seq: 1,
      surfaceOp: 'append',
      data: { id: 'a' },
    });
    const replaced = narrowNativeEvent({
      type: 'system/message',
      seq: 2,
      surfaceOp: { op: 'replace', startSeq: 0, endSeq: 1 },
      data: {},
    });
    const outside = narrowNativeEvent({ type: 'turn/start', seq: 3, data: { turn: 1 } });

    expect([appended.surface, replaced.surface, outside.surface]).toStrictEqual([
      'append',
      'replace',
      null,
    ]);
  });

  it('does not treat a surfaceOp on an event that is not a message as a surface entry', () => {
    expect(
      narrowNativeEvent({ type: 'step/start', seq: 1, surfaceOp: 'append' }).surface,
    ).toBeNull();
  });

  it('leaves an event type it has no use for as other', () => {
    expect(
      narrowNativeEvent({ type: 'plugin:x/y', seq: 1, data: { anything: 1 } }).body,
    ).toStrictEqual({
      type: 'other',
    });
  });

  it('refuses a known event whose data has the wrong shape', () => {
    expect(() => narrowNativeEvent({ type: 'tool/call', seq: 1, data: { callId: 3 } })).toThrow();
  });

  it('refuses something that is not an event at all', () => {
    expect(() => narrowNativeEvent({ type: 'turn/start' })).toThrow();
  });

  it('reads the usage of an assistant event from its settled stream only', () => {
    const body = narrowNativeEvent({
      type: 'assistant/message',
      seq: 1,
      surfaceOp: 'append',
      data: { stream: [TEXT_RECORD, USAGE_RECORD] },
    }).body;

    expect(usageOfAssistant(body)).toStrictEqual([{ inputTokens: 7, outputTokens: 2 }]);
    expect(usageOfAssistant({ type: 'turn/start' })).toStrictEqual([]);
    expect(
      usageOfAssistant(narrowNativeEvent({ type: 'assistant/attempt', seq: 2 }).body),
    ).toStrictEqual([]);
  });
});

describe('choosing the events the hub reduces', () => {
  it.each(['turn/end', 'tool/result', 'llm/retry', 'user/message', 'system/message'])(
    'reduces %s',
    (type) => {
      expect(isProjectedType(type)).toBe(true);
    },
  );

  it.each(['step/start', 'plugin:x/y'])('leaves %s to the log alone', (type) => {
    expect(isProjectedType(type)).toBe(false);
  });
});
