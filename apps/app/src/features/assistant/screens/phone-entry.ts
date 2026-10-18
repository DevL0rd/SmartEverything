import type { LastChat } from '../data/last-chat';

export const RECENT_CHAT_MS = 30 * 60_000;

export function chatWasRecent(seenAt: number | null, now: number): boolean {
  return seenAt !== null && now - seenAt < RECENT_CHAT_MS;
}

export type PhoneEntry =
  | { readonly kind: 'wait' }
  | { readonly kind: 'chat'; readonly chatId: string | null; readonly forget: boolean };

export function phoneEntryOf(last: LastChat, newest: string | null, reopen: boolean): PhoneEntry {
  switch (last.kind) {
    case 'pending':
      return { kind: 'wait' };
    case 'gone':
      return { kind: 'chat', chatId: newest, forget: true };
    case 'open':
      return { kind: 'chat', chatId: reopen ? last.chatId : null, forget: false };
    case 'none':
      return { kind: 'chat', chatId: newest, forget: false };
  }
}
