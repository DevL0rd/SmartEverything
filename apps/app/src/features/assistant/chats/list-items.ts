import type { AiChatHit } from '@smarteverything/domain';
import type { ChatRowItem, ChatSection } from './chat-entry';

const HITS_KEY = 'hits';

export type ListItem =
  | { readonly type: 'header'; readonly key: string; readonly title: string }
  | { readonly type: 'chat'; readonly key: string; readonly item: ChatRowItem }
  | {
      readonly type: 'subagents';
      readonly key: string;
      readonly parentId: string;
      readonly rows: readonly ChatRowItem[];
    }
  | { readonly type: 'hit'; readonly key: string; readonly hit: AiChatHit };

function familyItems(rows: readonly ChatRowItem[]): readonly ListItem[] {
  const grouped = new Set(
    rows.filter((row) => row.nested && row.entry.kind === 'subagent').map((row) => row.entry.id),
  );
  return rows.flatMap((item): readonly ListItem[] => {
    if (grouped.has(item.entry.id)) return [];
    const children = rows.filter(
      (row) => row.entry.parentId === item.entry.id && grouped.has(row.entry.id),
    );
    return [
      { type: 'chat', key: item.entry.id, item },
      ...(children.length === 0
        ? []
        : [
            {
              type: 'subagents',
              key: `subagents-${item.entry.id}`,
              parentId: item.entry.id,
              rows: children,
            } as const,
          ]),
    ];
  });
}

export function itemsOf(
  sections: readonly ChatSection[],
  hits: readonly AiChatHit[],
): readonly ListItem[] {
  const chats = sections.flatMap((section): readonly ListItem[] => [
    { type: 'header', key: `header-${section.key}`, title: section.title },
    ...familyItems(section.data),
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
