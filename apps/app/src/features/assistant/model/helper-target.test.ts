import { describe, expect, it } from 'vitest';
import { ENGINE } from '@smarteverything/domain';
import { referenceInsertion } from '../references/intent';
import { adjustedReferences } from '../references/spans';
import {
  addressOf,
  replyableHelperId,
  helperUnavailable,
  withoutHelperMentions,
  type HelperMention,
} from './helper-target';
import { actionPlan } from './message-actions';

const NOVA = '00000000-0000-4000-8000-000000000011';
const MIRA = '00000000-0000-4000-8000-000000000012';
const MESSAGE = '00000000-0000-4000-8000-000000000013';
const PARENT = '00000000-0000-4000-8000-000000000014';
const PROFILE = '00000000-0000-4000-8000-000000000015';

const HELPER = {
  id: NOVA,
  kind: 'subagent',
  parent_id: PARENT,
  profile_id: PROFILE,
  deletion_state: null,
  archived_at: null,
  engine: ENGINE.parse({ kind: 'claude', device_id: MIRA, model: 'claude-sonnet' }),
} as const;

const MESSAGE_ROW = { id: MESSAGE, chat_id: PARENT, profile_id: PROFILE };
const ACTION_CONTEXT = {
  speaker: 'ai',
  hasText: true,
  hasMedia: false,
  canShareMedia: false,
  canRetry: false,
  canReact: false,
  canMention: false,
  canEdit: false,
  pointer: false,
  groupDialogue: 'from_helper',
} as const;

describe('addressed helper drafts', () => {
  it('leaves DSH grants to the hub and keeps computer providers owner-only', () => {
    const chat = { deletion_state: null, archived_at: null };
    const dsh = ENGINE.parse({
      kind: 'dsh',
      execution_target: { kind: 'server' },
      session_id: 'dsh-helper',
      model_route_id: NOVA,
      model: 'fixture-model',
    });
    const claude = ENGINE.parse({ kind: 'claude', device_id: MIRA, model: 'claude-sonnet' });
    expect(helperUnavailable({ ...chat, engine: dsh }, false)).toBeNull();
    expect(helperUnavailable({ ...chat, engine: claude }, false)).toBe(
      'Only the owner can message this computer helper.',
    );
    expect(helperUnavailable({ ...chat, engine: claude }, true)).toBeNull();
  });

  it('keeps a selected participant after text moves and clears it when the token is edited', () => {
    const insertion = referenceInsertion('@No', { start: 0, end: 3, query: 'No' }, 'Nova');
    const mention: HelperMention = {
      chatId: NOVA,
      name: 'Nova',
      token: insertion.token,
      start: insertion.start,
      end: insertion.end,
    };
    const prefixed = `Hi ${insertion.text}`;
    const body = `${prefixed}please review`;
    const moved = adjustedReferences(insertion.text, prefixed, [mention]);
    const spans = adjustedReferences(prefixed, body, moved);
    expect(withoutHelperMentions(body, spans)).toBe('Hi please review');
    expect(addressOf(spans, null)).toEqual({ kind: 'helper', target: { chat_id: NOVA } });
    expect(
      addressOf(adjustedReferences(body, body.replace('@Nova', '@Noah'), spans), null),
    ).toEqual({ kind: 'ordinary' });
  });

  it('requires one participant and keeps the quoted helper when an extra mention is removed', () => {
    const quote = {
      who: 'Nova',
      text: 'Old reply',
      messageId: MESSAGE,
      helperChatId: NOVA,
    };
    const mention = { chatId: MIRA, name: 'Mira', token: '@Mira', start: 0, end: 5 };
    expect(addressOf([mention], quote)).toEqual({ kind: 'conflict' });
    expect(addressOf([], quote)).toEqual({ kind: 'helper', target: { chat_id: NOVA } });
    expect(addressOf([], { messageId: MESSAGE, who: 'Nova', text: '@Nova' })).toEqual({
      kind: 'ordinary',
    });
  });

  it('offers Reply and addresses the saved message to an available direct helper', () => {
    const helperChatId = replyableHelperId(MESSAGE_ROW, HELPER, true);
    const plan = actionPlan({ ...ACTION_CONTEXT, canReplyToHelper: helperChatId !== undefined });
    expect(plan.list.find(({ id }) => id === 'quote')?.label).toBe('Reply');
    expect(
      addressOf([], { messageId: MESSAGE, who: 'Nova', text: 'The totals match.', helperChatId }),
    ).toEqual({ kind: 'helper', target: { chat_id: NOVA } });
  });

  it.each([
    ['belongs to the source chat', { ...HELPER, parent_id: MIRA }, true],
    ['belongs to another profile', { ...HELPER, profile_id: MIRA }, true],
    ['was removed', null, true],
    ['was archived', { ...HELPER, archived_at: '2026-11-06T10:00:00.000Z' }, true],
    ['is read-only', { ...HELPER, native_admission: 'retired' }, true],
    ['requires owner access', HELPER, false],
  ] as const)('offers an ordinary Quote when the helper %s', (_condition, target, owner) => {
    const helperChatId = replyableHelperId(MESSAGE_ROW, target, owner);
    const plan = actionPlan({ ...ACTION_CONTEXT, canReplyToHelper: helperChatId !== undefined });
    expect(plan.list.find(({ id }) => id === 'quote')?.label).toBe('Quote');
    expect(
      addressOf([], { messageId: MESSAGE, who: 'Nova', text: 'The totals match.', helperChatId }),
    ).toEqual({ kind: 'ordinary' });
  });
});
