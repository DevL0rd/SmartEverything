import { useState, type ReactNode, type RefObject } from 'react';
import { ScrollView, type View } from 'react-native';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { PullUpPanel } from '../../../components/pull-up-panel';
import { ActivityTab } from './activity-tab';
import { BranchesTab } from './branches-tab';
import { DetailsHeader } from './details-header';
import { DetailsScopeProvider } from './details-scope';
import { type DetailTab, type DetailsTarget } from './details-target';
import { FilesTab } from './files-tab';
import { OverviewTab } from './overview-tab';
import { ToolsTab } from './tools-tab';

export interface ChatDetailsProps {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly open: boolean;
  readonly target: DetailsTarget;
  readonly behindRef: RefObject<View | null>;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}

interface TabBodyProps {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly tab: DetailTab;
  readonly runId: string | null;
  readonly onRun: (runId: string | null) => void;
}

function TabBody({ chat, rows, tab, runId, onRun }: TabBodyProps): ReactNode {
  switch (tab) {
    case 'overview':
      return <OverviewTab chat={chat} rows={rows} />;
    case 'activity':
      return <ActivityTab chat={chat} runId={runId} onRun={onRun} />;
    case 'files':
      return <FilesTab chat={chat} rows={rows} />;
    case 'branches':
      return <BranchesTab chatId={chat.id} />;
    case 'tools':
      return <ToolsTab chat={chat} />;
  }
}

export function ChatDetails({
  chat,
  rows,
  open,
  target,
  behindRef,
  onClose,
  onDeleted,
}: ChatDetailsProps): ReactNode {
  const [seen, setSeen] = useState(target);
  const [tab, setTab] = useState<DetailTab>(target.tab);
  const [runId, setRunId] = useState<string | null>(target.agent);
  if (seen !== target) {
    setSeen(target);
    setTab(target.tab);
    setRunId(target.agent);
  }
  return (
    <DetailsScopeProvider value={{ close: onClose, onDeleted }}>
      <PullUpPanel
        open={open}
        onClose={onClose}
        label="Chat details"
        behindRef={behindRef}
        header={
          <DetailsHeader
            chat={chat}
            rows={rows}
            tab={tab}
            onTab={(next) => {
              setTab(next);
              setRunId(null);
            }}
          />
        }
      >
        <ScrollView
          role="tabpanel"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="pt-2"
        >
          <TabBody chat={chat} rows={rows} tab={tab} runId={runId} onRun={setRunId} />
        </ScrollView>
      </PullUpPanel>
    </DetailsScopeProvider>
  );
}
