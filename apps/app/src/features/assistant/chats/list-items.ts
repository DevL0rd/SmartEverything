import type { AiChatHit } from '@smarteverything/domain';
import type { VirtualSection } from '../../../components/virtual-list';
import { APP_SOURCE, type ChatSource } from '../model/chat-source';
import { sameEntry, type ChatEntry, type ChatFamily, type ChatSection } from './chat-entry';

const HITS_KEY = 'hits';

export type ListItem =
  | {
      readonly type: 'chat';
      readonly key: string;
      readonly entry: ChatEntry;
      readonly agents: readonly ChatEntry[];
      readonly open: boolean;
    }
  | {
      readonly type: 'agent';
      readonly key: string;
      readonly entry: ChatEntry;
    }
  | {
      readonly type: 'hit';
      readonly key: string;
      readonly hit: AiChatHit;
      readonly source: ChatSource;
      readonly target: ChatTarget;
    };

interface ChatTarget {
  readonly chatId: string;
  readonly messageId: string | null;
}

function familyItems(family: ChatFamily, expanded: ReadonlySet<string>): readonly ListItem[] {
  const open = family.agents.length > 0 && (family.matchedAgents || expanded.has(family.entry.id));
  return [
    { type: 'chat', key: family.entry.id, entry: family.entry, agents: family.agents, open },
    ...(open
      ? family.agents.map((entry): ListItem => ({ type: 'agent', key: entry.id, entry }))
      : []),
  ];
}

export function itemsOf(
  sections: readonly ChatSection[],
  hits: readonly AiChatHit[],
  expanded: ReadonlySet<string>,
  entries: ReadonlyMap<string, ChatEntry>,
): readonly VirtualSection<ListItem>[] {
  const chats = sections.map((section): VirtualSection<ListItem> => ({
    key: section.key,
    title: section.title,
    data: section.data.flatMap((family) => familyItems(family, expanded)),
  }));
  if (hits.length === 0) {
    return chats;
  }
  return [
    ...chats,
    {
      key: HITS_KEY,
      title: 'In messages',
      data: hits.map((hit): ListItem => ({
        type: 'hit',
        key: `hit-${hit.messageId ?? hit.chatId}`,
        hit,
        source: entries.get(hit.chatId)?.source ?? APP_SOURCE,
        target: hitTargetOf(hit, entries),
      })),
    },
  ];
}

function hitTargetOf(hit: AiChatHit, entries: ReadonlyMap<string, ChatEntry>): ChatTarget {
  let current = entries.get(hit.chatId);
  while (current?.kind === 'subagent') {
    const parent = entries.get(current.parentId ?? '');
    if (parent === undefined) {
      return { chatId: hit.chatId, messageId: hit.messageId };
    }
    current = parent;
  }
  return current === undefined || current.id === hit.chatId
    ? { chatId: hit.chatId, messageId: hit.messageId }
    : { chatId: current.id, messageId: null };
}

function sameChatItem(
  left: Extract<ListItem, { type: 'chat' }>,
  right: Extract<ListItem, { type: 'chat' }>,
): boolean {
  return (
    sameEntry(left.entry, right.entry) &&
    left.open === right.open &&
    left.agents.length === right.agents.length &&
    runningCount(left.agents) === runningCount(right.agents) &&
    needingCount(left.agents) === needingCount(right.agents)
  );
}

export function sameListItem(left: ListItem, right: ListItem): boolean {
  if (left.type === 'hit' && right.type === 'hit') {
    return left.key === right.key && left.hit === right.hit;
  }
  if (left.type === 'chat' && right.type === 'chat') {
    return sameChatItem(left, right);
  }
  return left.type === 'agent' && right.type === 'agent' && sameEntry(left.entry, right.entry);
}

export function runningCount(agents: readonly ChatEntry[]): number {
  return agents.filter((entry) => entry.line.kind === 'working').length;
}

export function needingCount(agents: readonly ChatEntry[]): number {
  return agents.filter((entry) => entry.requests > 0).length;
}
