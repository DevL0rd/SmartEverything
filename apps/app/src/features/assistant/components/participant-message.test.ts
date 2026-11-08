import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HELPER_DIALOGUE, type AssistantMessageRow } from '@smarteverything/domain';
import { threadOf, type MessageItem } from '../data/thread';
import { assistantParticipant, castOf, helperParticipant } from '../model/participant';
import { shownParticipant, startsRun } from './participant-message';
import { SpeakerAvatar, ringArcs } from './speaker-avatar';

const gate = vi.hoisted(() => ({ moving: false }));

vi.mock('../../../design/colour', () => ({ useColour: (role: string): string => role }));
vi.mock('../../../design/animation-gate', () => ({
  useAnimationGate: (): { readonly moving: boolean; readonly reduced: boolean } => ({
    moving: gate.moving,
    reduced: false,
  }),
}));
vi.mock('../call/orb', () => ({
  AssistantOrb: ({ state, paused }: { readonly state: string; readonly paused: boolean }): string =>
    `orb ${state} ${paused ? 'resting' : 'moving'}`,
}));

const HELPER_CHAT = '00000000-0000-4000-8000-000000000004';

const OPTIONS = {
  cast: castOf('Coordinator', null),
  now: Date.parse('2026-11-07T12:00:00.000Z'),
  timeZone: 'UTC',
  unreadAfter: null,
  openedAt: 0,
  hidden: new Set<string>(),
};

function row(id: string, at: string, patch: Partial<AssistantMessageRow>): AssistantMessageRow {
  return {
    id,
    profile_id: '00000000-0000-4000-8000-000000000002',
    client_id: null,
    role: 'responder',
    kind: 'text',
    author: 'Coordinator',
    text: 'hello',
    attachments: [],
    state: 'answered',
    reason: null,
    reason_code: null,
    client_message_id: null,
    steps: [],
    step_states: [],
    reply_to: null,
    quote: null,
    chat_id: '00000000-0000-4000-8000-000000000003',
    origin: { source: 'app', plugin_id: null, device_id: null, name: 'Me' },
    embeds: [],
    cost_micros: 0,
    model: null,
    created_at: `2026-11-07T10:0${at}:00.000Z`,
    updated_at: `2026-11-07T10:0${at}:00.000Z`,
    ...patch,
  };
}

function dialogue(direction: 'to_helper' | 'from_helper'): AssistantMessageRow['embeds'] {
  return [
    HELPER_DIALOGUE.parse({
      kind: 'helper_dialogue',
      direction,
      helper_chat_id: HELPER_CHAT,
      helper_name: 'Onyx',
    }),
  ];
}

function byKey(rows: readonly AssistantMessageRow[]): ReadonlyMap<string, MessageItem> {
  return new Map(threadOf(rows, OPTIONS).map((item) => [item.key, item]));
}

const ME = row('me', '0', { role: 'person', author: 'Me', text: 'check the lights' });

describe('shownParticipant', () => {
  it('hides the assistant header and avatar in a solo chat', () => {
    const items = byKey([ME, row('reply', '1', {})]);
    expect(items.get('reply')?.group).toBe(false);
    expect(shownParticipant(items.get('reply') ?? fail())).toBeNull();
  });

  it('names the assistant and every helper once a helper joins', () => {
    const items = byKey([
      ME,
      row('ask', '1', {
        role: 'person',
        text: 'compare the bulbs',
        origin: { source: 'chat', plugin_id: null, device_id: null, name: 'Main chat' },
        embeds: dialogue('to_helper'),
      }),
      row('answer', '2', { role: 'person', author: 'Onyx', embeds: dialogue('from_helper') }),
    ]);
    expect(shownParticipant(items.get('ask') ?? fail())).toEqual(
      assistantParticipant('Coordinator'),
    );
    expect(shownParticipant(items.get('answer') ?? fail())).toEqual(
      helperParticipant({ helper_chat_id: HELPER_CHAT, helper_name: 'Onyx' }),
    );
  });

  it('keeps the sender visible for someone other than the assistant in a solo chat', () => {
    const items = byKey([
      row('wake', '0', {
        role: 'person',
        author: 'Porch camera',
        origin: { source: 'wake', plugin_id: null, device_id: null, name: 'Porch camera' },
      }),
    ]);
    expect(shownParticipant(items.get('wake') ?? fail())).toMatchObject({
      kind: 'camera',
      name: 'Porch camera',
    });
  });
});

describe('startsRun', () => {
  it('puts the header only on the first message of a run', () => {
    const items = byKey([ME, row('one', '1', {}), row('two', '2', {})]);
    expect(startsRun(items.get('one') ?? fail())).toBe(true);
    expect(startsRun(items.get('two') ?? fail())).toBe(false);
  });
});

describe('SpeakerAvatar', () => {
  const onyx = helperParticipant({ helper_chat_id: HELPER_CHAT, helper_name: 'Onyx' });

  it('draws agents as a sparkle on a soft ink disc and people as an ink letter', () => {
    const agent = renderToStaticMarkup(
      createElement(SpeakerAvatar, { participant: onyx, live: false }),
    );
    expect(agent).toContain(`stroke="${onyx.ink}"`);
    expect(agent).toContain('M11.017 2.814');
    const person = renderToStaticMarkup(
      createElement(SpeakerAvatar, {
        participant: {
          id: 'person:Sam',
          name: 'Sam',
          kind: 'person',
          ink: 'viz-3',
          avatar: { kind: 'letter', letter: 'S' },
        },
        live: false,
      }),
    );
    expect(person).toContain('>S<');
    expect(person).not.toContain('<svg');
  });

  it('uses the assistant orb, resting until the assistant works', () => {
    const assistant = assistantParticipant('Coordinator');
    const resting = renderToStaticMarkup(
      createElement(SpeakerAvatar, { participant: assistant, live: false }),
    );
    expect(resting).toContain('orb idle resting');
    const working = renderToStaticMarkup(
      createElement(SpeakerAvatar, { participant: assistant, live: true }),
    );
    expect(working).toContain('orb thinking moving');
  });

  it('spins the live ring only while the agent works and the row may animate', () => {
    gate.moving = false;
    const resting = renderToStaticMarkup(
      createElement(SpeakerAvatar, { participant: onyx, live: true }),
    );
    expect(resting).not.toContain('stroke-opacity="0.4"');
    gate.moving = true;
    const working = renderToStaticMarkup(
      createElement(SpeakerAvatar, { participant: onyx, live: true }),
    );
    expect(working).toContain('width="30"');
    expect(working.match(/stroke-width="1.5"/g)).toHaveLength(2);
    expect(working).toContain('stroke-opacity="0.4"');
    const idle = renderToStaticMarkup(
      createElement(SpeakerAvatar, { participant: onyx, live: false }),
    );
    expect(idle).not.toContain('stroke-opacity="0.4"');
  });

  it('draws the ring as two quarter arcs just outside the avatar', () => {
    const { head, tail } = ringArcs(30);
    expect(head).toMatch(/^M 4\.\d+ 4\.\d+ A 14\.25 14\.25 0 0 1 25\.\d+ 4\.\d+$/);
    expect(tail).toMatch(/^M 25\.\d+ 4\.\d+ A 14\.25 14\.25 0 0 1 25\.\d+ 25\.\d+$/);
  });
});

function fail(): never {
  throw new Error('Expected a message item.');
}
