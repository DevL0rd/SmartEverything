import { describe, expect, it } from 'vitest';
import { emojiOf, HELPER_DIALOGUE, type AssistantMessageRow } from '@smarteverything/domain';
import {
  QUICK_REACTIONS,
  actionPlan,
  lastMessageOf,
  mentionText,
  participantChatId,
  readablePlan,
  type ActionContext,
} from './message-actions';
import { castOf } from './participant';

const CHAT = '00000000-0000-4000-8000-000000000003';
const HELPER_CHAT = '00000000-0000-4000-8000-000000000004';

const BASE: ActionContext = {
  speaker: 'ai',
  hasText: true,
  hasMedia: false,
  canShareMedia: false,
  canEdit: false,
  canRetry: false,
  canReact: true,
  canMention: false,
  pointer: false,
};

function labels(context: Partial<ActionContext>): readonly string[] {
  return actionPlan({ ...BASE, ...context }).list.map((action) => action.label);
}

function row(id: string, patch: Partial<AssistantMessageRow>, at: string): AssistantMessageRow {
  return {
    id,
    profile_id: '00000000-0000-4000-8000-000000000002',
    client_id: null,
    role: 'responder',
    kind: 'text',
    author: 'AI',
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
    chat_id: CHAT,
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: null,
    created_at: `2026-10-09T${at}.000Z`,
    updated_at: `2026-10-09T${at}.000Z`,
    ...patch,
  };
}

describe('actionPlan', () => {
  it('orders a reply as the Actions board: quote, copy, select, retry, details, delete last', () => {
    expect(labels({ canRetry: true })).toEqual([
      'Quote',
      'Copy',
      'Select text',
      'Retry',
      'Share…',
      'Branch from here',
      'Details',
      'Delete',
    ]);
    expect(actionPlan(BASE).list.at(-1)?.destructive).toBe(true);
  });

  it('offers Edit on my own message right after Copy and never Mention', () => {
    expect(labels({ speaker: 'me', canEdit: true, canMention: true })).toEqual([
      'Quote',
      'Copy',
      'Edit',
      'Select text',
      'Share…',
      'Branch from here',
      'Details',
      'Delete',
    ]);
  });

  it('offers Mention for another participant and no details or delete for a person', () => {
    expect(labels({ speaker: 'person', canMention: true })).toEqual([
      'Quote',
      'Copy',
      'Select text',
      'Mention',
      'Share…',
    ]);
  });

  it('turns quote into reply for a helper that can be answered and drops edit and retry', () => {
    expect(
      labels({
        speaker: 'ai',
        groupDialogue: 'from_helper',
        canReplyToHelper: true,
        canRetry: true,
      }),
    ).toEqual(['Reply', 'Copy', 'Select text', 'Share…', 'Delete']);
  });

  it('offers Save and Share of the file for media instead of sharing the text', () => {
    expect(labels({ hasMedia: true, canShareMedia: true, hasText: false })).toEqual([
      'Quote',
      'Save',
      'Share…',
      'Branch from here',
      'Details',
      'Delete',
    ]);
  });

  it('keeps pointer only copy actions with shortcuts', () => {
    const plan = actionPlan({ ...BASE, pointer: true });
    expect(plan.list.map((action) => action.id)).toEqual([
      'quote',
      'copy',
      'select',
      'branch',
      'copy-plain',
      'copy-link',
      'details',
      'delete',
    ]);
    expect(plan.list.find((action) => action.id === 'copy')?.shortcut).toBe('C');
  });

  it('gives a system line only copy and select', () => {
    expect(labels({ speaker: 'system', canReact: false })).toEqual([
      'Copy',
      'Select text',
      'Share…',
    ]);
  });

  it('removes every change and the reaction row from a read only chat', () => {
    const plan = readablePlan(
      actionPlan({ ...BASE, speaker: 'me', canEdit: true, canRetry: true, canMention: true }),
      true,
    );
    expect(plan.reactions).toBe(false);
    expect(plan.list.map((action) => action.id)).toEqual(['copy', 'select', 'share', 'details']);
  });
});

describe('QUICK_REACTIONS', () => {
  it('holds six catalogue emoji', () => {
    expect(QUICK_REACTIONS).toHaveLength(6);
    expect(QUICK_REACTIONS.map((glyph) => emojiOf(glyph)?.name)).not.toContain(undefined);
  });
});

describe('mentionText', () => {
  it('appends the mention with one separating space and a trailing space', () => {
    expect(mentionText('', 'Onyx')).toBe('@Onyx ');
    expect(mentionText('Ask', 'Onyx')).toBe('Ask @Onyx ');
    expect(mentionText('Ask ', 'Onyx')).toBe('Ask @Onyx ');
  });
});

describe('participantChatId', () => {
  it('reads the chat of a helper and nothing else', () => {
    expect(participantChatId(`helper:${HELPER_CHAT}`)).toBe(HELPER_CHAT);
    expect(participantChatId(`chat:${HELPER_CHAT}`)).toBeNull();
    expect(participantChatId('helper:Onyx')).toBeNull();
    expect(participantChatId('assistant')).toBeNull();
    expect(participantChatId('person:Ana')).toBeNull();
  });
});

describe('lastMessageOf', () => {
  it('finds the newest message with text from that participant in this chat', () => {
    const embeds = [
      HELPER_DIALOGUE.parse({
        kind: 'helper_dialogue',
        direction: 'from_helper',
        helper_chat_id: HELPER_CHAT,
        helper_name: 'Onyx',
      }),
    ];
    const origin = { source: 'subagent', plugin_id: null, device_id: null, name: 'Onyx' } as const;
    const rows = [
      row('a', { embeds, origin, text: 'first' }, '10:00:00'),
      row('b', { embeds, origin, text: 'second' }, '10:02:00'),
      row('c', { embeds, origin, text: ' ' }, '10:03:00'),
      row('d', { text: 'assistant' }, '10:04:00'),
      row('e', { embeds, origin, text: 'elsewhere', chat_id: HELPER_CHAT }, '10:05:00'),
    ];
    expect(
      lastMessageOf(rows, CHAT, `helper:${HELPER_CHAT}`, castOf('Coordinator', null))?.id,
    ).toBe('b');
    expect(lastMessageOf(rows, CHAT, 'assistant', castOf('Coordinator', null))?.id).toBe('d');
    expect(lastMessageOf(rows, CHAT, 'person:Ana', castOf('Coordinator', null))).toBeNull();
  });
});
