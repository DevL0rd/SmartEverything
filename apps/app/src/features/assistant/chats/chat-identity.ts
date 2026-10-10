import { useMemo } from 'react';
import type { AiChatRow } from '@smarteverything/domain';
import { useAiChat } from '../data/chat-store';
import { usePluginNames } from '../data/plugin-names';
import { chatSourceOf, type ChatSource } from '../model/chat-source';

export interface ChatIdentity {
  readonly source: ChatSource;
  readonly lead: string | null;
  readonly parent: AiChatRow | null;
}

function leadOf(source: ChatSource, parent: AiChatRow | null): string | null {
  switch (source.kind) {
    case 'app':
      return null;
    case 'branch':
      return parent === null ? source.label : `${source.label} of ${parent.title}`;
    case 'plugin':
    case 'call':
    case 'camera':
    case 'schedule':
      return source.label;
  }
}

export function useChatIdentity(chat: AiChatRow): ChatIdentity {
  const names = usePluginNames();
  const parent = useAiChat(chat.parent_id);
  const source = useMemo(() => chatSourceOf(chat, names), [chat, names]);
  return { source, lead: leadOf(source, parent), parent };
}
