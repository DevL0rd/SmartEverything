import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import type { AiChatRow } from '@smarteverything/domain';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { SourceMark } from '../chats/source-mark';
import type { ChatSource } from '../model/chat-source';
import { useAiChats } from '../data/chat-store';
import { useGo } from './details-scope';
import { useMoment } from './use-moment';

const BRANCH_SOURCE: ChatSource = {
  kind: 'branch',
  pluginId: null,
  label: 'Branch',
  filterKey: null,
};

export function useBranches(chatId: string): readonly AiChatRow[] {
  return useAiChats().filter((chat) => chat.parent_id === chatId && chat.kind !== 'subagent');
}

export function BranchesTab({ chatId }: { readonly chatId: string }): ReactNode {
  const branches = useBranches(chatId);
  const go = useGo();
  const when = useMoment();
  if (branches.length === 0) {
    return (
      <EmptyState
        compact
        icon="gitBranch"
        title="No branches yet"
        body="Use Branch from here on any message to try another direction."
      />
    );
  }
  return (
    <List>
      {branches.map((branch) => (
        <ListRow
          key={branch.id}
          title={branch.title}
          subtitle={when(branch.created_at)}
          leading={<SourceMark source={BRANCH_SOURCE} size={32} />}
          chevron
          onPress={() => {
            go(href.assistantChat(branch.id));
          }}
        />
      ))}
    </List>
  );
}
