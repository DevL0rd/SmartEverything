import { describe, expect, it } from 'vitest';
import {
  CHAT_RETRYING_REASON,
  type ChatActivityNotice,
  type ChatStreamNotice,
} from '@smarteverything/domain';
import { withFrame, withSnapshot, type Turns } from './chat-turns';

const frame = (seq: number, delta: string): ChatStreamNotice => ({
  type: 'chat_stream',
  chatId: 'c',
  turnId: 't',
  seq,
  parts: [{ kind: 'text', delta }],
});

describe('withFrame', () => {
  it('appends in-order frames without queueing them', () => {
    let turns: Turns = {};
    for (let seq = 1; seq <= 5; seq += 1) turns = withFrame(turns, frame(seq, `w${String(seq)} `));
    expect(turns['t']).toMatchObject({
      text: 'w1 w2 w3 w4 w5 ',
      seq: 5,
      behind: false,
      waiting: [],
      state: 'replying',
    });
  });

  it('keeps the earlier turns object entries untouched', () => {
    const base = withFrame(withFrame({}, { ...frame(1, 'z'), turnId: 'u' }), frame(1, 'a'));
    const next = withFrame(base, frame(2, 'b'));
    expect(Object.entries(next).find(([id]) => id === 'u')?.[1]).toBe(
      Object.entries(base).find(([id]) => id === 'u')?.[1],
    );
  });

  it('holds out-of-order frames until the gap closes', () => {
    let turns = withFrame({}, frame(1, 'a'));
    turns = withFrame(turns, frame(3, 'c'));
    expect(turns['t']).toMatchObject({ text: 'a', behind: true });
    turns = withFrame(turns, frame(2, 'b'));
    expect(turns['t']).toMatchObject({ text: 'abc', seq: 3, behind: false, waiting: [] });
  });

  it('ignores a frame already applied', () => {
    const turns = withFrame({}, frame(1, 'a'));
    expect(withFrame(turns, frame(1, 'x'))).toBe(turns);
  });
});

describe('a retrying turn', () => {
  it('drops the retrying reason as soon as the turn streams again', () => {
    const notice: ChatActivityNotice = {
      type: 'chat_activity',
      chatId: 'c',
      turnId: 't',
      messageId: null,
      seq: 0,
      state: 'thinking',
      steps: [],
      draft: '',
      reasoning: '',
      tools: [],
      finish: null,
      reason: CHAT_RETRYING_REASON,
    };
    const retrying = withSnapshot({}, notice);
    expect(retrying['t']?.reason).toBe(CHAT_RETRYING_REASON);
    expect(withFrame(retrying, frame(1, 'back'))['t']?.reason).toBeNull();
  });
});
