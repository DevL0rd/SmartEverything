import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AiAgentRun, AiChatRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { IconWell } from '../../../components/icon-well';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useAgentRuns } from '../data/agent-runs';
import { isActiveRun, runSummary } from '../details/run-state';
import { LoadFailed, RowsSkeleton } from '../details/section-state';
import { AgentDetails } from './agent-details';
import { LaunchAgent } from './launch-agent';
import { background } from '@smarteverything/logging';

type Runs = ReturnType<typeof useAgentRuns>;

function runsOf(runs: Runs): readonly AiAgentRun[] {
  return runs.data?.pages.flatMap((page) => page.runs) ?? [];
}

function RunRows({
  list,
  quiet,
  onOpen,
}: {
  readonly list: readonly AiAgentRun[];
  readonly quiet: boolean;
  readonly onOpen: (runId: string) => void;
}): ReactNode {
  if (list.length === 0) {
    return quiet ? (
      <EmptyState
        compact
        icon="activity"
        title="Nothing running"
        body="Agents and background work for this chat appear here."
      />
    ) : null;
  }
  return (
    <List title="Agents">
      {list.map((run) => (
        <ListRow
          key={run.id}
          title={run.title}
          subtitle={runSummary(run)}
          leading={<IconWell icon="bot" colour={isActiveRun(run) ? 'info' : 'viz-1'} size="m" />}
          chevron
          onPress={() => {
            onOpen(run.id);
          }}
        />
      ))}
    </List>
  );
}

function RunList({
  chat,
  runs,
  quiet,
  onOpen,
}: {
  readonly chat: AiChatRow;
  readonly runs: Runs;
  readonly quiet: boolean;
  readonly onOpen: (runId: string) => void;
}): ReactNode {
  if (runs.error !== null) {
    return (
      <LoadFailed
        what="agents"
        retry={() => {
          background(runs.refetch(), 'runs.refetch_failed');
        }}
      />
    );
  }
  if (runs.isPending) return <RowsSkeleton />;
  return (
    <>
      <RunRows list={runsOf(runs)} quiet={quiet} onOpen={onOpen} />
      <View className="flex-row flex-wrap items-center gap-2 px-4">
        <LaunchAgent chat={chat} />
        {runs.hasNextPage ? (
          <Button
            label="Load earlier"
            variant="text"
            loading={runs.isFetchingNextPage}
            onPress={() => {
              background(runs.fetchNextPage(), 'next_page.fetch_failed');
            }}
          />
        ) : null}
      </View>
    </>
  );
}

function ChildRun({
  chat,
  parentId,
  onDeleted,
}: {
  readonly chat: AiChatRow;
  readonly parentId: string;
  readonly onDeleted: () => void;
}): ReactNode {
  const runs = useAgentRuns(parentId);
  const run = runsOf(runs).find((row) => row.child_chat_id === chat.id);
  if (run !== undefined) {
    return (
      <AgentDetails
        key={run.id}
        chatId={parentId}
        agentRunId={run.id}
        onBack={null}
        onDeleted={onDeleted}
      />
    );
  }
  if (runs.error !== null) {
    return (
      <LoadFailed
        what="this agent"
        retry={() => {
          background(runs.refetch(), 'runs.refetch_failed');
        }}
      />
    );
  }
  if (runs.hasNextPage) {
    return (
      <Button
        label="Load earlier"
        variant="text"
        loading={runs.isFetchingNextPage}
        onPress={() => {
          background(runs.fetchNextPage(), 'next_page.fetch_failed');
        }}
      />
    );
  }
  return runs.isPending ? <RowsSkeleton /> : null;
}

function ParentRuns({
  chat,
  runId,
  quiet,
  onRun,
}: {
  readonly chat: AiChatRow;
  readonly runId: string | null;
  readonly quiet: boolean;
  readonly onRun: (runId: string | null) => void;
}): ReactNode {
  const runs = useAgentRuns(chat.id);
  if (runId !== null) {
    return (
      <AgentDetails
        key={runId}
        chatId={chat.id}
        agentRunId={runId}
        onBack={() => {
          onRun(null);
        }}
        onDeleted={() => {
          onRun(null);
        }}
      />
    );
  }
  return <RunList chat={chat} runs={runs} quiet={quiet} onOpen={onRun} />;
}

export function AgentsSection({
  chat,
  runId,
  quiet,
  onRun,
  onDeleted,
}: {
  readonly chat: AiChatRow;
  readonly runId: string | null;
  readonly quiet: boolean;
  readonly onRun: (runId: string | null) => void;
  readonly onDeleted: () => void;
}): ReactNode {
  if (chat.kind === 'subagent' && chat.parent_id !== null) {
    return <ChildRun chat={chat} parentId={chat.parent_id} onDeleted={onDeleted} />;
  }
  return <ParentRuns chat={chat} runId={runId} quiet={quiet} onRun={onRun} />;
}
