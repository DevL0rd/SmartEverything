import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AiChatRow, ChatTimelineEmbed } from '@smarteverything/domain';
import { readToolResult, type ToolResultRequest } from '../../src/assistant/tool-result';
import { useRig, type Rig } from './harness/support/rig';
import { addMessage } from './harness/support/native-conversation';

let rig: Rig;
useRig((made) => {
  rig = made;
});

function timeline(callId: string, input: string, output: string): ChatTimelineEmbed {
  return {
    kind: 'chat_timeline',
    version: 1,
    parts: [
      {
        kind: 'tool',
        key: callId,
        tool: {
          callId,
          name: 'bash',
          title: 'bash',
          state: 'done',
          detail: null,
          input,
          output,
          redacted: false,
          image_operation_id: null,
        },
      },
    ],
  };
}

function replyWith(chat: AiChatRow, embed: ChatTimelineEmbed): void {
  const row = addMessage(rig, chat.id, { role: 'responder', text: 'done' });
  rig.opened.store.assistantChat.updateMessage(row.id, { embeds: [embed] });
}

function request(chat: AiChatRow, callId: string, offset = 0, limit = 10): ToolResultRequest {
  return { chatId: chat.id, callId, field: 'output', offset, limit };
}

describe('reading the full result of a tool call', () => {
  it('pages through an output that the timeline clips', () => {
    const chat = rig.newChat(rig.hub.target);
    replyWith(chat, timeline('call-1', 'ls', '0123456789abcdefghij0123'));
    const { store } = rig.opened;

    const first = readToolResult(store, request(chat, 'call-1'));
    const second = readToolResult(store, request(chat, 'call-1', first.next_offset ?? 0));
    const last = readToolResult(store, request(chat, 'call-1', second.next_offset ?? 0));

    expect([first.text, second.text, last.text]).toStrictEqual([
      '0123456789',
      'abcdefghij',
      '0123',
    ]);
    expect([first.total_chars, first.next_offset, last.next_offset]).toStrictEqual([24, 10, null]);
  });

  it('reads the input of a call when asked', () => {
    const chat = rig.newChat(rig.hub.target);
    replyWith(chat, timeline('call-1', 'echo hello', 'hello'));

    const page = readToolResult(rig.opened.store, {
      ...request(chat, 'call-1', 0, 100),
      field: 'input',
    });

    expect(page).toMatchObject({ field: 'input', text: 'echo hello', next_offset: null });
  });

  it('finds a call in an earlier reply of the chat', () => {
    const chat = rig.newChat(rig.hub.target);
    replyWith(chat, timeline('old-call', 'a', 'old output'));
    replyWith(chat, timeline('new-call', 'b', 'new output'));

    const page = readToolResult(rig.opened.store, request(chat, 'old-call', 0, 100));

    expect(page.text).toBe('old output');
  });

  it('does not reach a call of another chat', () => {
    const mine = rig.newChat(rig.hub.target);
    const other = rig.newChat(rig.hub.target);
    replyWith(other, timeline('their-call', 'a', 'secret'));

    expect(() => readToolResult(rig.opened.store, request(mine, 'their-call'))).toThrow(
      'no tool call their-call',
    );
  });

  it('says so when the chat has no such call', () => {
    const chat = rig.newChat(rig.hub.target);

    expect(() => readToolResult(rig.opened.store, request(chat, randomUUID()))).toThrow(
      'no tool call',
    );
  });
});
