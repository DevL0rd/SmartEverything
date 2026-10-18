import { describe, expect, it } from 'vitest';
import type { AssistantMessageRow, ChatTimelinePart } from '@smarteverything/domain';
import { replyParts, replyTimeline } from './reply-timeline';

function tool(id: string, state: 'running' | 'done'): ChatTimelinePart {
  return {
    kind: 'tool',
    key: `tool-${id}`,
    tool: {
      callId: id,
      name: 'read',
      title: 'Read',
      state,
      detail: null,
      input: null,
      output: null,
      redacted: false,
      image_operation_id: null,
    },
  };
}

function reply(id: string, parts: readonly ChatTimelinePart[]): AssistantMessageRow {
  return {
    id,
    profile_id: '00000000-0000-4000-8000-000000000002',
    client_id: null,
    role: 'responder',
    kind: 'text',
    author: 'Coordinator',
    text: '',
    attachments: [],
    state: 'working',
    reason: null,
    reason_code: null,
    client_message_id: null,
    steps: [],
    step_states: [],
    reply_to: null,
    chat_id: '00000000-0000-4000-8000-000000000003',
    origin: { source: 'app', plugin_id: null, device_id: null, name: 'Me' },
    embeds: [{ kind: 'chat_timeline', version: 1, parts: structuredClone(parts) }],
    cost_micros: 0,
    model: null,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
  };
}

describe('replyParts', () => {
  it('keeps unchanged parts identical when a later version of the reply arrives', () => {
    const first = reply('shared-1', [tool('a', 'done'), { kind: 'text', key: 't', text: 'One' }]);
    const next = reply('shared-1', [
      tool('a', 'done'),
      { kind: 'text', key: 't', text: 'One two' },
      tool('b', 'running'),
    ]);
    const before = replyParts(first);
    const after = replyParts(next);
    expect(after?.[0]).toBe(before?.[0]);
    expect(after?.[1]).not.toBe(before?.[1]);
    expect(replyTimeline(next)?.parts[0]).toBe(replyTimeline(first)?.parts[0]);
  });

  it('shares nothing between different replies', () => {
    const left = replyParts(reply('shared-2', [tool('a', 'done')]));
    const right = replyParts(reply('shared-3', [tool('a', 'done')]));
    expect(left?.[0]).not.toBe(right?.[0]);
  });
});
