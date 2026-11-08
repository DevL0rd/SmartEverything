import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ASSISTANT_MESSAGE_ROW, type AssistantReaction } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { QUICK_REACTIONS } from '../model/message-actions';
import { COLOUR_VARIABLE, PaletteContext } from '../../../design/colour-roles';
import { speakerOf } from '../model/speaker';
import {
  MessageReactionPicker,
  MessageReactions,
  QuickReactions,
  reactionGroupsOf,
  type MessageReactionModel,
} from './message-reactions';

const showPicker = vi.hoisted(() => vi.fn(() => null));
vi.mock('../../../components/emoji-picker', () => ({ EmojiPicker: showPicker }));

const CHAT = 'a1b2c3d4-0000-4000-8000-000000000001';
const CHILD = 'a1b2c3d4-0000-4000-8000-000000000002';
const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000003';
const MESSAGE = 'a1b2c3d4-0000-4000-8000-000000000004';
const NOW = '2026-11-06T09:55:00.000Z';

it.each(['chat', 'subagent'] as const)(
  'previews local %s dialogue under the visible Coordinator name',
  (source) => {
    const row = ASSISTANT_MESSAGE_ROW.parse({
      id: MESSAGE,
      chat_id: CHAT,
      profile_id: PROFILE,
      client_id: null,
      role: 'person',
      kind: 'text',
      author: 'Working chat title',
      text: 'Check the layout.',
      attachments: [],
      state: null,
      reason: null,
      steps: [],
      reply_to: null,
      quote: null,
      origin: { source, plugin_id: null, device_id: null, name: 'Working chat title' },
      embeds: [
        {
          kind: 'helper_dialogue',
          direction: 'to_helper',
          helper_chat_id: CHILD,
          helper_name: 'Onyx',
        },
      ],
      cost_micros: 0,
      model: null,
      created_at: NOW,
      updated_at: NOW,
    });
    renderToStaticMarkup(
      createElement(MessageReactionPicker, {
        row,
        speakerName: speakerOf(row, 'Coordinator').name,
        model: { pending: new Set<string>(), members: [], own: new Set<string>(), toggle: vi.fn() },
        onClose: vi.fn(),
      }),
    );
    expect(showPicker).toHaveBeenLastCalledWith(
      expect.objectContaining({ preview: 'Coordinator · Check the layout.' }),
      undefined,
    );
  },
);

const PERSON = { kind: 'person', id: PROFILE, label: 'Ana' } as const;
const OTHER = { kind: 'person', id: CHILD, label: 'Ben' } as const;
const AI = { kind: 'assistant', id: CHAT, label: 'Coordinator' } as const;

function painted(node: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(createElement(PaletteContext, { value: COLOUR_VARIABLE }, node));
}

function reactionModel(
  members: readonly AssistantReaction[],
  own: readonly string[],
): MessageReactionModel {
  return { pending: new Set<string>(), members, own: new Set(own), toggle: vi.fn() };
}

describe('reactions', () => {
  it('groups reactions by emoji in arrival order', () => {
    const groups = reactionGroupsOf([
      { emoji: QUICK_REACTIONS[0] ?? '', actor: PERSON },
      { emoji: QUICK_REACTIONS[5] ?? '', actor: AI },
      { emoji: QUICK_REACTIONS[0] ?? '', actor: OTHER },
    ]);
    expect(groups.map(([emoji, members]) => [emoji, members.length])).toEqual([
      [QUICK_REACTIONS[0], 2],
      [QUICK_REACTIONS[5], 1],
    ]);
  });

  it('shows a chip for every emoji with its count and marks my own', () => {
    const members = QUICK_REACTIONS.map((emoji) => ({ emoji, actor: OTHER }));
    const markup = painted(
      createElement(MessageReactions, {
        model: reactionModel(
          [...members, { emoji: QUICK_REACTIONS[1] ?? '', actor: PERSON }],
          [QUICK_REACTIONS[1] ?? ''],
        ),
        enabled: true,
        align: 'start',
      }),
    );
    for (const emoji of QUICK_REACTIONS) expect(markup).toContain(emoji);
    expect(markup).toContain('2 reactions, including you');
    expect(markup).not.toContain('Who reacted');
    expect(markup).not.toContain('reactions</');
  });

  it('renders nothing without reactions', () => {
    const markup = painted(
      createElement(MessageReactions, {
        model: reactionModel([], []),
        enabled: true,
        align: 'end',
      }),
    );
    expect(markup).toBe('');
  });

  it('offers the six quick reactions and more in the menu row', () => {
    const markup = painted(
      createElement(QuickReactions, {
        model: reactionModel([], [QUICK_REACTIONS[0] ?? '']),
        close: vi.fn(),
        onMore: vi.fn(),
      }),
    );
    for (const emoji of QUICK_REACTIONS) expect(markup).toContain(emoji);
    expect(markup).toContain('More reactions');
  });
});
