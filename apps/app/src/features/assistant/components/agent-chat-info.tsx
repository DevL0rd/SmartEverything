import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { AiChatRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { href } from '../../../app-shell/hrefs';
import { QueryState } from '../../computers/components/query-state';
import { useAgentRuns, useAgentRunsSupported } from '../data/agent-runs';
import { AgentDetails } from './agent-details';

export function AgentChatInfo({
  chat,
  onDeleted,
}: {
  readonly chat: AiChatRow;
  readonly onDeleted: () => void;
}): ReactNode {
  const { agent } = useLocalSearchParams<{ agent?: string }>();
  const supported = useAgentRunsSupported();
  if (!supported) return null;
  if (agent !== undefined)
    return (
      <AgentDetails
        chatId={chat.kind === 'subagent' ? (chat.parent_id ?? chat.id) : chat.id}
        key={agent}
        agentRunId={agent}
        {...(chat.kind === 'subagent' ? { childChatId: chat.id } : {})}
        onDeleted={onDeleted}
      />
    );
  if (chat.kind !== 'subagent' || chat.parent_id === null) return <ParentRunInfo chat={chat} />;
  return <ChildRunInfo chat={chat} parentId={chat.parent_id} onDeleted={onDeleted} />;
}

function ChildRunInfo({
  chat,
  parentId,
  onDeleted,
}: {
  readonly chat: AiChatRow;
  readonly parentId: string;
  readonly onDeleted: () => void;
}): ReactNode {
  const runs = useAgentRuns(parentId);
  const run = runs.data?.pages
    .flatMap((page) => page.runs)
    .find((row) => row.child_chat_id === chat.id);
  if (run !== undefined)
    return (
      <AgentDetails
        key={run.id}
        chatId={parentId}
        agentRunId={run.id}
        childChatId={chat.id}
        onDeleted={onDeleted}
      />
    );
  return (
    <>
      <QueryState
        error={runs.error}
        pending={runs.isPending}
        retry={() => {
          void runs.refetch();
        }}
      />
      {runs.hasNextPage ? (
        <Button
          label="Load earlier run details"
          variant="text"
          loading={runs.isFetchingNextPage}
          onPress={() => {
            void runs.fetchNextPage();
          }}
        />
      ) : null}
    </>
  );
}

function ParentRunInfo({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const runs = useAgentRuns(chat.id);
  const childless =
    runs.data?.pages.flatMap((page) => page.runs).filter((run) => run.child_chat_id === null) ?? [];
  return (
    <>
      {childless.length === 0 ? null : (
        <List title="Agent activity">
          {childless.map((run) => (
            <NavRow
              key={run.id}
              title={run.title}
              subtitle={run.progress ?? run.state}
              href={href.assistantChat(chat.id, { sheet: 'chat', agent: run.id })}
            />
          ))}
        </List>
      )}
      <QueryState
        error={runs.error}
        pending={runs.isPending}
        retry={() => {
          void runs.refetch();
        }}
      />
      {runs.hasNextPage ? (
        <Button
          label="Load earlier run details"
          variant="text"
          loading={runs.isFetchingNextPage}
          onPress={() => {
            void runs.fetchNextPage();
          }}
        />
      ) : null}
    </>
  );
}
