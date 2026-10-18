import type { ReactNode } from 'react';
import type { Href } from 'expo-router';
import type { AiChatRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { ListRow } from '../../../components/list-row';
import type { ChatIdentity } from '../chats/chat-identity';

export function linkRowsOf(
  identity: ChatIdentity,
  kind: AiChatRow['kind'],
  go: (target: Href) => void,
): readonly ReactNode[] {
  const { source, parent } = identity;
  const pluginId = source.kind === 'plugin' ? source.pluginId : null;
  return [
    pluginId === null ? null : (
      <ListRow
        key="source"
        title={`Started from ${source.label}`}
        chevron
        onPress={() => {
          go(href.pluginSettings(pluginId));
        }}
      />
    ),
    parent === null ? null : (
      <ListRow
        key="parent"
        title={
          kind === 'subagent' ? `Parent chat · ${parent.title}` : `Branched from ${parent.title}`
        }
        chevron
        onPress={() => {
          go(href.assistantChat(parent.id));
        }}
      />
    ),
  ];
}
