import { z } from 'zod';
import type { AiChatRow, AssistantMessageRow, AssistantNewMessage } from '@smarteverything/domain';
import type { Quote } from './composer-state';

export const HELPER_MENTION = z.strictObject({
  chatId: z.uuid(),
  name: z.string().min(1),
  token: z.string().min(1),
  start: z.int().nonnegative(),
  end: z.int().positive(),
});

export type HelperMention = z.output<typeof HELPER_MENTION>;
export type HelperTarget = NonNullable<AssistantNewMessage['helper_target']>;

export type Address =
  | { readonly kind: 'ordinary' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'helper'; readonly target: HelperTarget };

export function addressOf(mentions: readonly HelperMention[], quote: Quote | null): Address {
  const ids = new Set(mentions.map((item) => item.chatId));
  if (quote?.helperChatId !== undefined) ids.add(quote.helperChatId);
  if (ids.size > 1) return { kind: 'conflict' };
  const [id] = ids;
  if (id === undefined) return { kind: 'ordinary' };
  return { kind: 'helper', target: { chat_id: id } };
}

type HelperAvailability = Pick<
  AiChatRow,
  'deletion_state' | 'archived_at' | 'native_admission' | 'engine'
>;
type HelperAddressTarget = HelperAvailability &
  Pick<AiChatRow, 'kind' | 'parent_id' | 'profile_id'>;

export function helperUnavailable(chat: HelperAvailability, owner: boolean): string | null {
  if (chat.deletion_state !== null)
    return 'This helper is being deleted or needs deletion resolved.';
  if (chat.archived_at !== null) return 'Reopen this archived helper to reply.';
  if (
    chat.native_admission === 'retired' ||
    (chat.engine.kind === 'claude' && chat.engine.continued_from !== undefined)
  )
    return 'This helper is read-only.';
  if (chat.engine.kind !== 'dsh' && !owner)
    return 'Only the owner can message this computer helper.';
  return null;
}

export function helperAddressReason(
  parent: Pick<AiChatRow, 'id' | 'profile_id'> | undefined,
  target: HelperAddressTarget | null,
  owner: boolean,
): string | null {
  if (
    parent === undefined ||
    target?.kind !== 'subagent' ||
    target.parent_id !== parent.id ||
    target.profile_id !== parent.profile_id
  )
    return 'That helper is no longer available in this chat.';
  return helperUnavailable(target, owner);
}

export function replyableHelperId(
  row: Pick<AssistantMessageRow, 'chat_id' | 'profile_id'>,
  target: (HelperAddressTarget & Pick<AiChatRow, 'id'>) | null,
  owner: boolean,
): string | undefined {
  const parent = { id: row.chat_id, profile_id: row.profile_id };
  if (target === null || helperAddressReason(parent, target, owner) !== null) return undefined;
  return target.id;
}

export function withoutHelperMentions(text: string, mentions: readonly HelperMention[]): string {
  let end = text.length;
  let result = '';
  for (const item of [...mentions].sort((left, right) => right.start - left.start)) {
    const adjacentSpaces = text[item.start - 1] === ' ' && text[item.end] === ' ';
    result = text.slice(adjacentSpaces ? item.end + 1 : item.end, end) + result;
    end = item.start;
  }
  return (text.slice(0, end) + result).trim();
}
