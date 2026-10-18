import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { TabsBar, type TabItem } from '../../../components/tabs-bar';
import { useAgentRuns } from '../data/agent-runs';
import { isActiveRun } from './run-state';
import { useActiveImageOperations } from './background-ops';
import { useBranches } from './branches-tab';
import { attachedFilesOf } from './attachments-model';
import { useAgentsSupported } from './activity-tab';
import { DETAIL_TABS, type DetailTab } from './details-target';
import { HeaderTitle } from './header-title';
import { QuickActions } from './quick-actions';

const TAB_LABEL: Readonly<Record<DetailTab, string>> = {
  overview: 'Overview',
  activity: 'Activity',
  files: 'Files',
  branches: 'Branches',
  tools: 'Tools',
};

function labelled(tab: DetailTab, count: number): string {
  return count > 0 && tab !== 'overview' && tab !== 'tools'
    ? `${TAB_LABEL[tab]} · ${String(count)}`
    : TAB_LABEL[tab];
}

function useTabCounts(
  chat: AiChatRow,
  rows: readonly AssistantMessageRow[],
): Readonly<Record<DetailTab, number>> {
  const supported = useAgentsSupported(chat);
  const runs = useAgentRuns(chat.id);
  const running = (runs.data?.pages.flatMap((page) => page.runs) ?? []).filter(isActiveRun).length;
  const operations = useActiveImageOperations(chat.id).length;
  const branches = useBranches(chat.id).length;
  return {
    overview: 0,
    activity: (supported ? running : 0) + operations,
    files: attachedFilesOf(rows).length,
    branches,
    tools: 0,
  };
}

export function DetailsHeader({
  chat,
  rows,
  tab,
  onTab,
}: {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly tab: DetailTab;
  readonly onTab: (tab: DetailTab) => void;
}): ReactNode {
  const counts = useTabCounts(chat, rows);
  const items: readonly TabItem[] = DETAIL_TABS.map((key) => ({
    key,
    label: labelled(key, counts[key]),
    onPress: (): void => {
      onTab(key);
    },
  }));
  return (
    <View>
      <HeaderTitle chat={chat} />
      <QuickActions chat={chat} rows={rows} />
      <TabsBar items={items} active={tab} label="Chat details sections" />
    </View>
  );
}
