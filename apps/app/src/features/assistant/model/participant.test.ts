import { describe, expect, it } from 'vitest';
import {
  HELPER_DIALOGUE,
  type AssistantMessageRow,
  type HelperDialogue,
} from '@smarteverything/domain';
import {
  castOf,
  continuesRun,
  isGroup,
  originOf,
  participantOf,
  rosterOf,
  type ItemOrigin,
  type Participant,
  type RunMember,
} from './participant';
import { speakerOf } from './speaker';

const HELPER_CHAT = '00000000-0000-4000-8000-000000000004';
const OTHER_CHAT = '00000000-0000-4000-8000-000000000005';

function row(
  id: string,
  patch: Partial<AssistantMessageRow>,
  at = '10:00:00',
): AssistantMessageRow {
  return {
    id,
    profile_id: '00000000-0000-4000-8000-000000000002',
    client_id: null,
    role: 'person',
    kind: 'text',
    author: 'Ana',
    text: 'hello',
    attachments: [],
    state: null,
    reason: null,
    reason_code: null,
    client_message_id: null,
    steps: [],
    step_states: [],
    reply_to: null,
    quote: null,
    chat_id: '00000000-0000-4000-8000-000000000003',
    origin: { source: 'app', plugin_id: null, device_id: null, name: 'Ana' },
    embeds: [],
    cost_micros: 0,
    model: null,
    created_at: `2026-10-09T${at}.000Z`,
    updated_at: `2026-10-09T${at}.000Z`,
    ...patch,
  };
}

function dialogue(
  direction: 'to_helper' | 'from_helper',
  helper = 'Onyx',
  chat = HELPER_CHAT,
): HelperDialogue {
  return HELPER_DIALOGUE.parse({
    kind: 'helper_dialogue',
    direction,
    helper_chat_id: chat,
    helper_name: helper,
  });
}

const MAIN = castOf('Coordinator', null);

const HELPER_HOST = castOf('Coordinator', {
  id: HELPER_CHAT,
  kind: 'subagent',
  helper_name: 'Onyx',
});

function participant(source: AssistantMessageRow, cast = MAIN): Participant | null {
  return participantOf(source, speakerOf(source, 'Coordinator'), cast);
}

describe('participantOf', () => {
  it('names the viewer, the assistant and a helper with stable ids and inks', () => {
    const mine = participant(row('a', {}));
    const reply = participant(row('b', { role: 'responder', author: 'AI' }));
    const helper = participant(
      row('c', {
        origin: { source: 'subagent', plugin_id: null, device_id: null, name: 'Onyx' },
        embeds: [dialogue('from_helper')],
      }),
    );
    expect(mine).toMatchObject({ id: 'me', kind: 'me', avatar: { kind: 'letter', letter: 'A' } });
    expect(reply).toMatchObject({
      id: 'assistant',
      name: 'Coordinator',
      kind: 'assistant',
      ink: 'primary',
      avatar: { kind: 'agent' },
    });
    expect(helper).toMatchObject({ id: `helper:${HELPER_CHAT}`, name: 'Onyx', kind: 'helper' });
    expect(helper?.ink).not.toBe('viz-4');
    expect(helper?.ink).not.toBe('primary');
  });

  it('shows the coordinator talking to a helper as the assistant, not as the person', () => {
    const toHelper = participant(
      row('a', {
        origin: { source: 'chat', plugin_id: null, device_id: null, name: 'Main chat' },
        embeds: [dialogue('to_helper')],
      }),
    );
    expect(toHelper).toMatchObject({ id: 'assistant', name: 'Coordinator' });
  });

  it('shows a coordinator ask relayed into a helper chat as the assistant, not a second sender', () => {
    const ask = participant(
      row('a', {
        author: 'Coordinator',
        origin: {
          source: 'chat',
          plugin_id: null,
          device_id: null,
          name: 'Kitchen plan',
          chat_id: OTHER_CHAT,
        },
      }),
      HELPER_HOST,
    );
    expect(ask).toEqual(MAIN.assistant);
  });

  it('makes the helper the AI of its own chat and keeps another helper under its own id', () => {
    const reply = participant(row('a', { role: 'responder', author: 'Onyx' }), HELPER_HOST);
    const sibling = participant(
      row('b', {
        author: 'Jade',
        origin: {
          source: 'subagent',
          plugin_id: null,
          device_id: null,
          name: 'Jade',
          chat_id: OTHER_CHAT,
        },
      }),
      HELPER_HOST,
    );
    expect(reply).toEqual(HELPER_HOST.host);
    expect(reply).toMatchObject({ id: `helper:${HELPER_CHAT}`, name: 'Onyx', kind: 'helper' });
    expect(sibling).toMatchObject({ id: `helper:${OTHER_CHAT}`, name: 'Jade', kind: 'helper' });
  });

  it('keeps cameras, schedules, plugins and other people apart', () => {
    const camera = participant(
      row('a', { origin: { source: 'wake', plugin_id: null, device_id: null, name: 'Hall' } }),
    );
    const schedule = participant(
      row('b', {
        author: 'Morning',
        origin: { source: 'schedule', plugin_id: null, device_id: null, name: null },
      }),
    );
    const plugin = participant(
      row('c', {
        author: 'Weather',
        origin: { source: 'plugin', plugin_id: 'weather', device_id: null, name: null },
      }),
    );
    const guest = participant(
      row('d', {
        author: 'Bo',
        origin: {
          source: 'plugin',
          plugin_id: 'discord',
          device_id: null,
          name: null,
          requester: 'approved',
        },
      }),
    );
    expect([camera?.kind, schedule?.kind, plugin?.kind, guest?.kind]).toEqual([
      'camera',
      'schedule',
      'plugin',
      'person',
    ]);
    expect(camera?.name).toBe('Hall');
    expect(guest?.id).toBe('person:Bo');
  });

  it('has no participant for a system line', () => {
    expect(participant(row('a', { role: 'system', kind: 'update' }))).toBeNull();
  });
});

describe('originOf', () => {
  it('reports voice, schedule, camera and relayed chats, and nothing for helper dialogue', () => {
    const voice = row('a', {
      origin: { source: 'voice', plugin_id: null, device_id: null, name: null },
    });
    const relayed = row('b', {
      origin: { source: 'chat', plugin_id: null, device_id: null, name: 'Main chat' },
    });
    const helper = row('c', {
      origin: { source: 'chat', plugin_id: null, device_id: null, name: 'Main chat' },
      embeds: [dialogue('to_helper')],
    });
    const origin = (source: AssistantMessageRow): ItemOrigin | null =>
      originOf(source, speakerOf(source, 'Coordinator'));
    expect(origin(voice)?.kind).toBe('voice');
    expect(origin(relayed)).toMatchObject({ kind: 'relayed', name: 'Main chat' });
    expect(origin(helper)).toBeNull();
    expect(origin(row('d', {}))).toBeNull();
  });
});

describe('roster and group rule', () => {
  function members(
    rows: readonly AssistantMessageRow[],
  ): readonly { readonly row: AssistantMessageRow; readonly participant: Participant | null }[] {
    return rows.map((source) => ({ row: source, participant: participant(source) }));
  }

  it('is solo with only the viewer and the assistant', () => {
    const roster = rosterOf(members([row('a', {}), row('b', { role: 'responder' })]));
    expect(roster.map(({ id }) => id)).toEqual(['me', 'assistant']);
    expect(isGroup(roster)).toBe(false);
  });

  it('turns into a group when a helper is spoken to, once, in first-seen order', () => {
    const toHelper = (id: string): AssistantMessageRow =>
      row(id, {
        origin: { source: 'chat', plugin_id: null, device_id: null, name: 'Main' },
        embeds: [dialogue('to_helper')],
      });
    const roster = rosterOf(members([row('a', {}), toHelper('b'), toHelper('c')]));
    expect(roster.map(({ id }) => id)).toEqual(['me', 'assistant', `helper:${HELPER_CHAT}`]);
    expect(isGroup(roster)).toBe(true);
  });
});

describe('continuesRun', () => {
  const member = (source: AssistantMessageRow): RunMember => ({
    row: source,
    participant: participant(source),
  });

  it('groups rows of one participant within the run window and splits others', () => {
    const first = member(row('a', { role: 'responder' }, '10:00:00'));
    const soon = member(row('b', { role: 'responder' }, '10:03:00'));
    const late = member(row('c', { role: 'responder' }, '10:09:00'));
    const mine = member(row('d', {}, '10:03:00'));
    expect(continuesRun(first, soon)).toBe(true);
    expect(continuesRun(first, late)).toBe(false);
    expect(continuesRun(first, mine)).toBe(false);
    expect(continuesRun(undefined, first)).toBe(false);
  });

  it('groups consecutive messages to a helper and splits different helpers', () => {
    const to = (id: string, chat: string, at: string): RunMember =>
      member(
        row(
          id,
          {
            origin: { source: 'chat', plugin_id: null, device_id: null, name: 'Main' },
            embeds: [dialogue('to_helper', 'Onyx', chat)],
          },
          at,
        ),
      );
    const from = (id: string, helper: string, chat: string, at: string): RunMember =>
      member(
        row(
          id,
          {
            origin: { source: 'subagent', plugin_id: null, device_id: null, name: helper },
            embeds: [dialogue('from_helper', helper, chat)],
          },
          at,
        ),
      );
    expect(continuesRun(to('a', HELPER_CHAT, '10:00:00'), to('b', OTHER_CHAT, '10:01:00'))).toBe(
      true,
    );
    expect(
      continuesRun(
        from('c', 'Onyx', HELPER_CHAT, '10:00:00'),
        from('d', 'Nova', OTHER_CHAT, '10:01:00'),
      ),
    ).toBe(false);
  });

  it('never joins a call row', () => {
    const call = member(row('a', { kind: 'call', role: 'responder' }));
    expect(continuesRun(call, member(row('b', { role: 'responder' })))).toBe(false);
  });
});
