import { describe, expect, it } from 'vitest';
import { CLAUDE_SESSION } from '@smarteverything/domain';
import { withContinuingChats } from '../../src/computers/session-chats';

const NONE = null;

function session(id: string): ReturnType<typeof CLAUDE_SESSION.parse> {
  return CLAUDE_SESSION.parse({
    id,
    desktop_id: NONE,
    title: id,
    cwd: '/work',
    state: 'idle',
    last_state: NONE,
    archived: false,
    model: NONE,
    permission_mode: 'default',
    entrypoint: NONE,
    pid: NONE,
    started_at: NONE,
    updated_at: NONE,
    waiting_prompts: 0,
    context_used: NONE,
    capabilities: {
      send: NONE,
      interrupt: NONE,
      answer_prompts: NONE,
      set_mode: NONE,
      set_model: NONE,
      usage: NONE,
    },
  });
}

describe('naming the app chat that continues a Desktop session', () => {
  const first = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';

  it('adds the chat id to a continued session and null to the rest', () => {
    const listed = withContinuingChats(
      [session('a'), session('b')],
      [{ id: first, session_id: 'a' }],
    );
    expect(listed.map((row) => [row.id, row.app_chat_id])).toEqual([
      ['a', first],
      ['b', null],
    ]);
  });

  it('keeps the first chat when several continue the same session', () => {
    const listed = withContinuingChats(
      [session('a')],
      [
        { id: first, session_id: 'a' },
        { id: second, session_id: 'a' },
      ],
    );
    expect(listed[0]?.app_chat_id).toBe(first);
  });
});
