import { describe, expect, it } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { threadOf } from './thread';

const OPTIONS = {
  now: Date.parse('2026-10-09T12:00:00.000Z'),
  timeZone: 'UTC',
  unreadAfter: null,
  openedAt: 0,
  hidden: new Set<string>(),
};

function row(
  id: string,
  role: AssistantMessageRow['role'],
  state: AssistantMessageRow['state'],
  when: { readonly at: string; readonly replyTo?: string },
): AssistantMessageRow {
  return {
    id,
    profile_id: '00000000-0000-4000-8000-000000000002',
    client_id: null,
    role,
    kind: 'text',
    author: role === 'person' ? 'Me' : 'AI',
    text: role === 'responder' && state === 'working' ? '' : 'hello',
    attachments: [],
    state,
    reason: null,
    reason_code: null,
    client_message_id: null,
    steps: [],
    step_states: [],
    reply_to: when.replyTo ?? null,
    chat_id: '00000000-0000-4000-8000-000000000003',
    origin: { source: 'app', plugin_id: null, device_id: null, name: 'Me' },
    embeds: [],
    cost_micros: 0,
    model: null,
    created_at: `2026-10-09T10:0${when.at}:00.000Z`,
    updated_at: `2026-10-09T10:0${when.at}:00.000Z`,
  };
}

describe('threadOf', () => {
  it('has no status item while a request awaits its reply', () => {
    const items = threadOf([row('a', 'person', 'delivered', { at: '1' })], OPTIONS);
    expect(items.map((item) => item.type)).toEqual(['message']);
  });

  it('keeps only messages while a reply works', () => {
    const items = threadOf(
      [
        row('a', 'person', 'delivered', { at: '1' }),
        row('b', 'responder', 'working', { at: '2', replyTo: 'a' }),
        row('c', 'person', 'delivered', { at: '3' }),
      ],
      OPTIONS,
    );
    expect(items.map((item) => item.key)).toEqual(['c', 'b', 'a']);
  });

  it('has no status item once the reply is done', () => {
    const items = threadOf(
      [
        row('a', 'person', 'answered', { at: '1' }),
        row('b', 'responder', 'answered', { at: '2', replyTo: 'a' }),
      ],
      OPTIONS,
    );
    expect(items.map((item) => item.type)).toEqual(['message', 'message']);
  });
});

describe('threadOf with a reply that failed before it said anything', () => {
  it('keeps the empty failed reply so its notice is shown, for a continued or triggered turn too', () => {
    const asked = row('a', 'person', 'answered', { at: '1' });
    const killed: AssistantMessageRow = {
      ...row('b', 'responder', 'failed', { at: '2' }),
      text: '',
      reason: 'The hub restarted.',
      reason_code: 'interrupted',
    };
    const items = threadOf([asked, killed], OPTIONS);
    expect(items.map((item) => item.key)).toEqual(['b', 'a']);
  });

  it('marks a request as replied once its failed reply is shown, so only the reply carries the notice', () => {
    const asked = row('a', 'person', 'failed', { at: '1' });
    const killed: AssistantMessageRow = {
      ...row('b', 'responder', 'failed', { at: '2', replyTo: 'a' }),
      text: '',
      reason_code: 'interrupted',
    };
    const items = threadOf([asked, killed], OPTIONS);
    expect(items.find((item) => item.key === 'a')?.replied).toBe(true);
  });
});

describe('threadOf with retired failed-action rows', () => {
  it('does not show a stored "Couldn’t do this" action row, but keeps a successful one', () => {
    const failed: AssistantMessageRow = {
      ...row('f', 'responder', 'answered', { at: '2' }),
      role: 'system',
      kind: 'action',
      text: 'Couldn’t do this: Log food or water (The arguments are not valid)',
    };
    const done: AssistantMessageRow = { ...failed, id: 'g', text: 'Log food or water' };
    const items = threadOf([failed, done], OPTIONS);
    expect(items.map((item) => item.key)).toEqual(['g']);
  });
});

describe('threadOf reply keys', () => {
  it('keeps the reply row key and slot when it settles from working', () => {
    const request = row('a', 'person', 'delivered', { at: '1' });
    const working = row('b', 'responder', 'working', { at: '2', replyTo: 'a' });
    const settled = { ...working, state: 'answered' as const, text: 'the full answer' };
    const during = threadOf([request, working], OPTIONS);
    const after = threadOf([request, settled], OPTIONS);
    expect(after.map((item) => item.key)).toEqual(during.map((item) => item.key));
    expect(after.findIndex((item) => item.key === 'b')).toBe(
      during.findIndex((item) => item.key === 'b'),
    );
  });

  it('keeps the reply key when an older working row exists in the same thread', () => {
    const earlier = row('a', 'person', 'answered', { at: '0' });
    const reply = row('r', 'responder', 'answered', { at: '1', replyTo: 'a' });
    const request = row('b', 'person', 'delivered', { at: '2' });
    const working = row('c', 'responder', 'working', { at: '3', replyTo: 'b' });
    const settled = { ...working, state: 'answered' as const, text: 'done' };
    const during = threadOf([earlier, reply, request, working], OPTIONS);
    const after = threadOf([earlier, reply, request, settled], OPTIONS);
    expect(after.map((item) => item.key)).toEqual(during.map((item) => item.key));
  });
});

describe('threadOf with long agent turns', () => {
  function agentTurn(
    id: string,
    at: string,
    state: AssistantMessageRow['state'],
  ): AssistantMessageRow {
    const parts = Array.from({ length: 60 }, (_, index) =>
      index % 2 === 0
        ? {
            kind: 'text',
            key: `t${String(index)}`,
            text: `Step ${String(index)} ${'detail '.repeat(20)}`,
          }
        : {
            kind: 'tool',
            key: `k${String(index)}`,
            tool: {
              callId: `c${String(index)}`,
              name: 'bash',
              title: 'bash',
              state: 'done',
              detail: null,
              input: null,
              output: null,
              redacted: false,
              image_operation_id: null,
            },
          },
    );
    return {
      ...row(id, 'responder', state, { at }),
      embeds: [{ kind: 'chat_timeline', version: 1, parts }],
    };
  }

  it('splits a settled turn into list items under the first segment key', () => {
    const items = threadOf([agentTurn('turn', '1', 'answered')], OPTIONS);
    expect(items.length).toBeGreaterThan(5);
    const chronological = [...items].reverse();
    expect(chronological[0]?.key).toBe('turn');
    expect(chronological.slice(1).map((item) => item.key)).toEqual(
      chronological.slice(1).map((_, index) => `turn#${String(index + 1)}`),
    );
    expect(chronological.map((item) => item.segment?.index)).toEqual(
      chronological.map((_, index) => index),
    );
    expect(chronological[0]?.day).not.toBeNull();
    for (const item of chronological.slice(1)) {
      expect(item.day).toBeNull();
      expect(item.gap).toBeNull();
      expect(item.divider).toBe(false);
      expect(item.position).toBe('middle');
      expect(item.row).toBe(chronological[0]?.row);
    }
  });

  it('keeps a working turn as one item', () => {
    const items = threadOf([agentTurn('turn', '1', 'working')], OPTIONS);
    expect(items).toHaveLength(1);
    expect(items[0]?.segment).toBeNull();
  });

  it('keeps settled rows without a timeline whole', () => {
    const items = threadOf([row('a', 'responder', 'answered', { at: '1' })], OPTIONS);
    expect(items[0]?.segment).toBeNull();
  });
});
