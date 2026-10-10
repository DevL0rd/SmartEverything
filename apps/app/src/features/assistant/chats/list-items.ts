import type { AiChatHit } from '@smarteverything/domain';
import type { ChatRowItem, ChatSection } from './chat-entry';

const HITS_KEY = 'hits';

export type ListItem =
  | { readonly type: 'header'; readonly key: string; readonly title: string }
  | { readonly type: 'chat'; readonly key: string; readonly item: ChatRowItem }
  | { readonly type: 'hit'; readonly key: string; readonly hit: AiChatHit };

export function itemsOf(
  sections: readonly ChatSection[],
  hits: readonly AiChatHit[],
): readonly ListItem[] {
  const chats = sections.flatMap((section): readonly ListItem[] => [
    { type: 'header', key: `header-${section.key}`, title: section.title },
    ...section.data.map((item): ListItem => ({ type: 'chat', key: item.entry.id, item })),
  ]);
  if (hits.length === 0) {
    return chats;
  }
  return [
    ...chats,
    { type: 'header', key: `header-${HITS_KEY}`, title: 'In messages' },
    ...hits.map((hit): ListItem => ({
      type: 'hit',
      key: `hit-${hit.messageId ?? hit.chatId}`,
      hit,
    })),
  ];
}

export function stickyIndicesOf(items: readonly ListItem[]): readonly number[] {
  return items.flatMap((item, index) => (item.type === 'header' ? [index] : []));
}
