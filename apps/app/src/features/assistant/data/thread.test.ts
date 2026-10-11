import { describe, expect, it } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { pendingRequestOf, statusRequestOf, threadOf } from './thread';

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
    expect(items.map((item) => item.key)).toEqual(['b', 'c', 'a']);
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

describe('pendingRequestOf', () => {
  it('finds a request with no reply', () => {
    const request = row('a', 'person', 'delivered', { at: '1' });
    expect(pendingRequestOf([request])).toBe(request);
  });

  it('ignores a request that already has a reply', () => {
    expect(
      pendingRequestOf([
        row('a', 'person', 'delivered', { at: '1' }),
        row('b', 'responder', 'working', { at: '2', replyTo: 'a' }),
      ]),
    ).toBeNull();
  });

  it('is empty for a settled chat', () => {
    expect(pendingRequestOf([row('a', 'person', 'answered', { at: '1' })])).toBeNull();
  });
});

describe('statusRequestOf', () => {
  it('finds the request of the working reply', () => {
    const request = row('a', 'person', 'delivered', { at: '1' });
    expect(
      statusRequestOf([request, row('b', 'responder', 'working', { at: '2', replyTo: 'a' })]),
    ).toBe(request);
  });

  it('finds a request that has no reply yet', () => {
    const request = row('a', 'person', 'delivered', { at: '1' });
    expect(statusRequestOf([request])).toBe(request);
  });

  it('is empty once the reply is done', () => {
    expect(
      statusRequestOf([
        row('a', 'person', 'answered', { at: '1' }),
        row('b', 'responder', 'answered', { at: '2', replyTo: 'a' }),
      ]),
    ).toBeNull();
  });
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
