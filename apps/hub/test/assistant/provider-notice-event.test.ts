import { PROVIDER_EVENT } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { noticeEvent } from '../../src/assistant/engines/computer/provider-notice-event';

const BASE = { job_id: crypto.randomUUID(), chat_id: crypto.randomUUID(), seq: 1 };

function user(): ReturnType<typeof PROVIDER_EVENT.parse> {
  return PROVIDER_EVENT.parse({
    ...BASE,
    kind: 'runtime',
    type: 'user',
    payload: {
      type: 'user',
      session_id: 's',
      tool_use_result: { file: { content: 'x'.repeat(500_000) } },
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 't1',
            content: [{ type: 'text', text: 'y'.repeat(500_000) }],
          },
        ],
      },
    },
  });
}

describe('noticeEvent', () => {
  it('sends a user runtime event without tool output', () => {
    const sent = noticeEvent(user());
    expect(sent).toMatchObject({
      kind: 'runtime',
      type: 'user',
      payload: {
        session_id: 's',
        message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: '' }] },
      },
    });
    expect(JSON.stringify(sent).length).toBeLessThan(1000);
    expect(PROVIDER_EVENT.safeParse(sent).success).toBe(true);
  });

  it('keeps other runtime events whole', () => {
    const event = PROVIDER_EVENT.parse({
      ...BASE,
      kind: 'runtime',
      type: 'assistant',
      payload: { message: { content: [{ type: 'text', text: 'hi' }] } },
    });
    expect(noticeEvent(event)).toBe(event);
  });

  it('empties a tool result event', () => {
    const event = PROVIDER_EVENT.parse({
      ...BASE,
      kind: 'tool_result',
      call_id: 'c',
      text: 'z'.repeat(1000),
      failed: false,
    });
    expect(noticeEvent(event)).toMatchObject({ kind: 'tool_result', text: '' });
  });
});
