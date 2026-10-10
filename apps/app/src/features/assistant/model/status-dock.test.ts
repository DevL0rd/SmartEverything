import { describe, expect, it } from 'vitest';
import type { ChatStreamNotice } from '@smarteverything/domain';
import { withFrame, withSnapshot, type Turns } from '../../../store/chat-turns';
import { sameStatusDock, statusDockOf } from './status-dock';

const CHAT = '00000000-0000-4000-8000-000000000003';

function started(): Turns {
  return withSnapshot(
    {},
    {
      type: 'chat_activity',
      chatId: CHAT,
      turnId: 'turn-1',
      messageId: null,
      state: 'thinking',
      seq: 0,
      draft: '',
      reasoning: 'considering',
      tools: [],
      steps: [],
      finish: null,
      reason: null,
    },
  );
}

function frame(seq: number, part: ChatStreamNotice['parts'][number]): ChatStreamNotice {
  return { type: 'chat_stream', chatId: CHAT, turnId: 'turn-1', seq, parts: [part] };
}

describe('statusDockOf', () => {
  it('is empty without a live turn', () => {
    expect(statusDockOf({}, CHAT)).toBeNull();
  });

  it('ignores updates that only add reply text once replying', () => {
    const first = withFrame(started(), frame(1, { kind: 'text', delta: 'one ' }));
    const second = withFrame(first, frame(2, { kind: 'text', delta: 'two ' }));
    expect(sameStatusDock(statusDockOf(first, CHAT), statusDockOf(second, CHAT))).toBe(true);
  });

  it('changes when a tool step arrives', () => {
    const before = statusDockOf(started(), CHAT);
    const after = statusDockOf(
      withFrame(
        started(),
        frame(1, {
          kind: 'tool',
          callId: 'c1',
          name: 'search',
          title: 'Searching',
          state: 'running',
          detail: null,
        }),
      ),
      CHAT,
    );
    expect(sameStatusDock(before, after)).toBe(false);
  });
});
