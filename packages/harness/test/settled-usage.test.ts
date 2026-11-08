import { describe, expect, it } from 'vitest';
import { settledUsage } from '../src/reducer';

const stream = (usage: Record<string, number>): unknown[] => [
  { type: 'chunk', time: 1, chunk: { type: 'usage', usage } },
];

describe('settled usage of a stored model reply', () => {
  it('counts cached input in the prompt and keeps cache write and reasoning apart', () => {
    const settled = settledUsage({
      type: 'assistant/message',
      seq: 3,
      surfaceOp: 'append',
      data: {
        stream: stream({
          inputTokens: 100,
          outputTokens: 40,
          cacheReadTokens: 900,
          cacheWriteTokens: 25,
          reasoningTokens: 12,
        }),
      },
    });

    expect(settled).toStrictEqual({
      inputTokens: 1025,
      outputTokens: 40,
      cacheReadTokens: 900,
      cacheWriteTokens: 25,
      reasoningTokens: 12,
    });
  });

  it('reads a discarded attempt the same way', () => {
    expect(
      settledUsage({
        type: 'assistant/attempt',
        seq: 4,
        data: { stream: stream({ inputTokens: 7, outputTokens: 1 }) },
      }),
    ).toStrictEqual({
      inputTokens: 7,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    });
  });

  it('ignores a history copy, a reply without usage and other events', () => {
    const copy = {
      type: 'assistant/message',
      seq: 5,
      data: { historyReplay: true, stream: stream({ inputTokens: 7, outputTokens: 1 }) },
    };

    expect(settledUsage(copy)).toBeUndefined();
    expect(
      settledUsage({ type: 'assistant/message', seq: 6, data: { stream: [] } }),
    ).toBeUndefined();
    expect(settledUsage({ type: 'turn/start', seq: 7 })).toBeUndefined();
  });
});
