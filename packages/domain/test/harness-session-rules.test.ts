import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_HARNESS_PERMISSION } from '../src/ai-harness';
import { AI_HARNESS_SESSION } from '../src/ai-harness-session';

const CHAT = '3a000000-0000-4000-8000-0000000000a1';
const OTHER_CHAT = '3a000000-0000-4000-8000-0000000000a2';
const PROFILE = '3a000000-0000-4000-8000-0000000000b1';
const ROUTE = '3a000000-0000-4000-8000-0000000000c1';

function session(change: { readonly session_id?: string; readonly chat_id?: string }): unknown {
  return {
    chat_id: change.chat_id ?? CHAT,
    session_id: change.session_id ?? 'dsh-1',
    metadata: {
      chat_id: CHAT,
      profile_id: PROFILE,
      header: { version: 4, id: 'dsh-1', createdAt: 0, isSeeded: false },
      inherited_event_count: 0,
      next_seq: 0,
      durable_seq: -1,
    },
    target: { kind: 'server' },
    epoch: null,
    directory: null,
    permission: DEFAULT_AI_HARNESS_PERMISSION,
    route: {
      route_id: ROUTE,
      capability_revision: 'r',
      model: 'm',
      effort: null,
    },
    state: 'idle',
    interactions: [],
    work: [],
    failure: null,
  };
}

describe('AI_HARNESS_SESSION', () => {
  it('accepts a session whose native metadata belongs to it', () => {
    expect(AI_HARNESS_SESSION.safeParse(session({})).success).toBe(true);
  });

  it.each([{ session_id: 'dsh-2' }, { chat_id: OTHER_CHAT }])(
    'refuses a session whose native metadata belongs to another: %j',
    (change) => {
      const parsed = AI_HARNESS_SESSION.safeParse(session(change));
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.message).toBe(
        'The native session metadata must belong to this session and chat.',
      );
    },
  );
});
