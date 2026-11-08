import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_CONTINUE_NOTE,
  HELPER_DIALOGUE,
  type AssistantMessageRow,
} from '@smarteverything/domain';
import { replyParts } from '../model/reply-timeline';
import { isAssistantParticipant, sourceLabelOf } from '../model/speaker';
import { marksStoppedTurn, sameMessage, threadOf } from './thread';
import { castOf } from '../model/participant';

const OPTIONS = {
  cast: castOf('My coordinator', null),
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
    quote: null,
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
  it('omits the internal resume note without dropping real messages or changing their order', () => {
    const person = {
      ...row('person', 'person', 'answered', { at: '0' }),
      text: ASSISTANT_CONTINUE_NOTE,
    };
    const resume: AssistantMessageRow = {
      ...row('resume', 'system', null, { at: '1' }),
      kind: 'update',
      text: ASSISTANT_CONTINUE_NOTE,
      origin: { source: 'hub', plugin_id: null, device_id: null, name: 'SmartEverything' },
    };
    const otherNote = { ...resume, id: 'other', text: 'The computer is ready.' };
    const reply = row('reply', 'responder', 'answered', { at: '2', replyTo: resume.id });
    expect(threadOf([otherNote, reply, resume, person], OPTIONS).map((item) => item.key)).toEqual([
      'reply',
      'other',
      'person',
    ]);
  });

  it('marks one stopped turn after the reply, falling back to the request if there is no reply', () => {
    const request = {
      ...row('request', 'person', 'failed', { at: '0' }),
      reason_code: 'stopped',
    } as const;
    const reply = {
      ...row('reply', 'responder', 'failed', { at: '1', replyTo: request.id }),
      reason_code: 'stopped',
    } as const;
    const interrupted = { ...reply, id: 'interrupted', reason_code: 'interrupted' } as const;
    const running = row('running', 'responder', 'working', { at: '2' });
    const completed = row('completed', 'responder', 'answered', { at: '3' });
    const markers = (rows: readonly AssistantMessageRow[]): string[] =>
      threadOf(rows, OPTIONS)
        .filter(marksStoppedTurn)
        .map((item) => item.key);
    expect(markers([request])).toEqual(['request']);
    expect(markers([request, reply, running, completed])).toEqual(['reply']);
    expect(markers([request, interrupted])).toEqual([]);
  });
  it.each([
    ['chat', 'Another chat'],
    ['subagent', 'Sub-agent'],
  ] as const)(
    'shows local %s dialogue as Coordinator speech and keeps cross-chat labels',
    (source, label) => {
      const toHelper = HELPER_DIALOGUE.parse({
        kind: 'helper_dialogue',
        direction: 'to_helper',
        helper_chat_id: '00000000-0000-4000-8000-000000000004',
        helper_name: 'Onyx',
      });
      const crossChat: AssistantMessageRow = {
        ...row('cross-chat', 'person', null, { at: '0' }),
        author: 'Other chat title',
        origin: { source, plugin_id: null, device_id: null, name: 'Other chat title' },
      };
      const fromCoordinator: AssistantMessageRow = {
        ...row('coordinator-to-helper', 'person', null, { at: '1' }),
        author: 'Current chat title',
        origin: { source, plugin_id: null, device_id: null, name: 'Current chat title' },
        embeds: [toHelper],
      };
      const fromHuman = {
        ...row('human-to-helper', 'person', null, { at: '2' }),
        embeds: [toHelper],
      };
      expect(threadOf([crossChat, fromCoordinator, fromHuman], OPTIONS)).toMatchObject([
        { key: 'human-to-helper', speaker: { kind: 'me', name: 'Me' } },
        {
          key: 'coordinator-to-helper',
          speaker: { kind: 'person', name: 'My coordinator', via: null },
        },
        { key: 'cross-chat', speaker: { kind: 'person', name: 'Other chat title', via: source } },
      ]);
      const plugins = new Map<string, string>();
      expect(sourceLabelOf(fromCoordinator, plugins)).toBeNull();
      expect(sourceLabelOf(fromHuman, plugins)).toBeNull();
      expect(sourceLabelOf(crossChat, plugins)).toBe(label);
      expect(isAssistantParticipant(fromCoordinator)).toBe(true);
      expect(isAssistantParticipant(fromHuman)).toBe(false);
      expect(isAssistantParticipant(crossChat)).toBe(false);
    },
  );
  it('updates the same message row when the coordinator name changes', () => {
    const message: AssistantMessageRow = {
      ...row('coordinator-to-helper', 'person', null, { at: '1' }),
      origin: { source: 'chat', plugin_id: null, device_id: null, name: 'Current chat title' },
      embeds: [
        HELPER_DIALOGUE.parse({
          kind: 'helper_dialogue',
          direction: 'to_helper',
          helper_chat_id: '00000000-0000-4000-8000-000000000004',
          helper_name: 'Onyx',
        }),
      ],
    };
    const [original] = threadOf([message], OPTIONS);
    const [same] = threadOf([message], OPTIONS);
    const [renamed] = threadOf([message], { ...OPTIONS, cast: castOf('New coordinator', null) });
    if (original === undefined || same === undefined || renamed === undefined)
      throw new Error('Expected the same message in every thread.');
    expect(sameMessage(original, same)).toBe(true);
    expect(sameMessage(original, renamed)).toBe(false);
    expect(renamed.speaker.name).toBe('New coordinator');
  });

  it('treats a named helper message as the latest assistant reply', () => {
    const normal = row('coordinator', 'responder', 'answered', { at: '1' });
    const helper: AssistantMessageRow = {
      ...row('helper', 'person', null, { at: '2' }),
      origin: { source: 'subagent', plugin_id: null, device_id: null, name: 'Nova' },
      embeds: [
        HELPER_DIALOGUE.parse({
          kind: 'helper_dialogue',
          direction: 'from_helper',
          helper_chat_id: '00000000-0000-4000-8000-000000000004',
          helper_name: 'Nova',
        }),
      ],
    };
    expect(threadOf([normal, helper], OPTIONS)).toMatchObject([
      {
        key: 'helper',
        speaker: { kind: 'person', name: 'Nova' },
        latestReply: true,
        position: 'only',
      },
      { key: 'coordinator', speaker: { kind: 'ai' }, latestReply: false, position: 'only' },
    ]);
    expect(isAssistantParticipant(helper)).toBe(true);
  });
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

  it('shows native tool results in the reply timeline instead of as extra system rows', () => {
    const reply: AssistantMessageRow = {
      ...row('reply', 'responder', 'answered', { at: '1' }),
      updated_at: '2026-10-09T10:03:00.000Z',
      embeds: [
        {
          kind: 'chat_timeline',
          version: 1,
          parts: [
            {
              kind: 'tool',
              key: 'tool-1',
              tool: {
                callId: 'call-1',
                name: 'set_light',
                title: 'Set the brightness',
                state: 'done',
                detail: null,
                input: null,
                output: null,
                redacted: false,
                image_operation_id: null,
              },
            },
          ],
        },
      ],
    };
    const duplicate: AssistantMessageRow = {
      ...row('duplicate', 'system', null, { at: '2' }),
      kind: 'action',
      origin: null,
      text: 'Set the brightness',
    };
    const note: AssistantMessageRow = { ...duplicate, id: 'note', kind: 'update' };
    const legacy: AssistantMessageRow = {
      ...row('legacy', 'system', null, { at: '0' }),
      kind: 'action',
      origin: null,
    };
    const standalone = {
      ...duplicate,
      id: 'standalone',
      created_at: '2026-10-09T10:04:00.000Z',
    };
    const items = threadOf([reply, duplicate, note, legacy, standalone], OPTIONS);
    expect(items.map(({ key }) => key)).toEqual(['standalone', 'note', 'reply', 'legacy']);
    const displayed = items.find(({ key }) => key === 'reply');
    expect(displayed && replyParts(displayed.row)).toMatchObject([
      { kind: 'tools', tools: [{ callId: 'call-1', state: 'done' }] },
    ]);
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

  it('marks only the last segment of a stopped turn', () => {
    const reply = { ...agentTurn('turn', '1', 'failed'), reason_code: 'stopped' } as const;
    const items = threadOf([reply], OPTIONS);
    expect(items.length).toBeGreaterThan(1);
    expect(items.filter(marksStoppedTurn)).toEqual([items[0]]);
  });

  it('omits tool-only continuation segments when activity steps are hidden', () => {
    const reply = agentTurn('turn', '1', 'answered');
    const normal = threadOf([reply], OPTIONS);
    const quiet = threadOf([reply], { ...OPTIONS, showSteps: false });
    expect(quiet.length).toBeLessThan(normal.length);
    expect(quiet[0]?.segment?.to).toBe(30);
  });

  it('keeps settled rows without a timeline whole', () => {
    const items = threadOf([row('a', 'responder', 'answered', { at: '1' })], OPTIONS);
    expect(items[0]?.segment).toBeNull();
  });
});

describe('threadOf participants', () => {
  const HELPER_CHAT = '00000000-0000-4000-8000-000000000004';
  const toHelper = (id: string, at: string, text: string): AssistantMessageRow => ({
    ...row(id, 'person', null, { at }),
    text,
    origin: { source: 'chat', plugin_id: null, device_id: null, name: 'Main chat' },
    embeds: [
      HELPER_DIALOGUE.parse({
        kind: 'helper_dialogue',
        direction: 'to_helper',
        helper_chat_id: HELPER_CHAT,
        helper_name: 'Onyx',
      }),
    ],
  });

  it('is solo with only the viewer and the assistant', () => {
    const items = threadOf(
      [row('a', 'person', 'answered', { at: '0' }), row('b', 'responder', 'answered', { at: '1' })],
      OPTIONS,
    );
    expect(items.every((item) => !item.group)).toBe(true);
    expect(items.map((item) => item.participant?.id)).toEqual(['assistant', 'me']);
    expect(items[0]?.participant).toMatchObject({ name: 'My coordinator', ink: 'primary' });
  });

  it('becomes a group once a helper is visible, and groups messages to a helper into one run', () => {
    const items = threadOf(
      [
        row('a', 'person', 'answered', { at: '0' }),
        toHelper('b', '1', 'check the lights'),
        toHelper('c', '2', '@Onyx and the blinds'),
      ],
      OPTIONS,
    );
    expect(items.every((item) => item.group)).toBe(true);
    expect(items.map((item) => [item.key, item.position])).toEqual([
      ['c', 'last'],
      ['b', 'first'],
      ['a', 'only'],
    ]);
  });

  it('gives each message its tokens, quote, origin and turn stats once', () => {
    const quote = {
      message_id: '00000000-0000-4000-8000-000000000009',
      author: 'Me',
      excerpt: 'earlier',
      media_kind: null,
    };
    const voice: AssistantMessageRow = {
      ...row('a', 'person', 'answered', { at: '0' }),
      quote,
      origin: { source: 'voice', plugin_id: null, device_id: null, name: null },
    };
    const items = threadOf(
      [
        voice,
        toHelper('b', '1', 'check the lights'),
        row('c', 'responder', 'answered', { at: '2' }),
      ],
      OPTIONS,
    );
    const byKey = new Map(items.map((item) => [item.key, item]));
    expect(byKey.get('a')).toMatchObject({ quote, origin: { kind: 'voice' }, mentions: null });
    expect(byKey.get('b')?.mentions?.[0]).toMatchObject({ kind: 'mention', text: '@Onyx' });
    expect(byKey.get('b')?.stats).toBeNull();
    expect(byKey.get('c')?.stats).toEqual({
      durationMs: null,
      tools: 0,
      cost: { model: null, cost_micros: 0, cost_incomplete: false },
    });
  });

  it('puts one meta line at the end of a run with the stats of the whole run', () => {
    const first = {
      ...row('a', 'responder', 'answered', { at: '0' }),
      cost_micros: 2000,
      steps: ['Search'],
    };
    const second = {
      ...row('b', 'responder', 'answered', { at: '1' }),
      cost_micros: 6000,
      updated_at: '2026-10-09T10:01:04.000Z',
    };
    const alone = { ...row('d', 'responder', 'answered', { at: '9' }), cost_micros: 4000 };
    const byKey = new Map(
      threadOf([first, second, row('c', 'person', 'answered', { at: '5' }), alone], OPTIONS).map(
        (item) => [item.key, item],
      ),
    );
    expect(byKey.get('a')?.stats).toBeNull();
    expect(byKey.get('b')?.stats).toMatchObject({
      durationMs: 4000,
      tools: 1,
      cost: { cost_micros: 8000 },
    });
    expect(byKey.get('d')?.stats?.cost.cost_micros).toBe(4000);
    expect(byKey.get('d')?.costPeak).toBe(8000);
  });

  it('resolves the quoted original so the strip can show its sender and attachment', () => {
    const original = row('a', 'responder', 'answered', { at: '0' });
    const reply = {
      ...row('b', 'person', 'answered', { at: '1' }),
      quote: { message_id: 'a', author: 'AI', excerpt: 'hello', media_kind: null },
    };
    const [mine] = threadOf([original, reply], OPTIONS);
    expect(mine?.quoted?.row).toBe(original);
    expect(mine?.quoted?.participant).toMatchObject({ id: 'assistant' });
  });

  it('keeps a message equal across rebuilds and changes it when its mentions change', () => {
    const rows = [toHelper('b', '1', 'check the lights')];
    const [first] = threadOf(rows, OPTIONS);
    const [second] = threadOf(rows, OPTIONS);
    if (first === undefined || second === undefined) throw new Error('Expected an item.');
    expect(sameMessage(first, second)).toBe(true);
  });
});
