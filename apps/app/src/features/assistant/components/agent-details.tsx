import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AiAgentRun } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useIsOwner } from '../../../store/selectors';
import { useAgentRun, useInterruptAgent } from '../data/agent-runs';
import { useGo } from '../details/details-scope';
import { LoadFailed, RowsSkeleton } from '../details/section-state';
import { RunTrace } from '../details/run-trace';
import { RunUsage } from '../details/run-usage';
import { runStateLabel } from '../details/run-state';
import { AgentChatDelete } from './agent-chat-delete';
import { AgentMessage } from './agent-message';
import { Markdown } from './markdown/markdown';
import { Text } from '../../../components/text';
import { background } from '@smarteverything/logging';

function Detail({ title, value }: { readonly title: string; readonly value: string }): ReactNode {
  return (
    <View className="gap-1 px-4 py-3">
      <Text variant="caption" tone="variant">
        {title}
      </Text>
      <Markdown text={value} selectable />
    </View>
  );
}

function FactRows({ run }: { readonly run: AiAgentRun }): ReactNode {
  const go = useGo();
  const child = run.child_chat_id;
  const parentRun = run.parent_run_id;
  return (
    <List>
      {[
        run.task === null ? null : <Detail key="task" title="Objective" value={run.task} />,
        run.progress === null ? null : (
          <Detail key="progress" title="Latest progress" value={run.progress} />
        ),
        run.result === null ? null : <Detail key="result" title="Result" value={run.result} />,
        run.error === null ? null : <Detail key="error" title="Error" value={run.error} />,
        run.truncated ? (
          <ListRow
            key="truncated"
            icon="info"
            iconTone="warning"
            title="This runtime’s retained output is truncated."
          />
        ) : null,
        child === null ? null : (
          <ListRow
            key="child"
            title="Open child chat"
            chevron
            onPress={() => {
              go(href.assistantChat(child));
            }}
          />
        ),
        parentRun === null ? null : (
          <ListRow
            key="parent"
            title="Parent agent"
            chevron
            onPress={() => {
              go(href.assistantChat(run.parent_chat_id, { sheet: 'chat', agent: parentRun }));
            }}
          />
        ),
      ]}
    </List>
  );
}

function Actions({
  run,
  onDeleted,
}: {
  readonly run: AiAgentRun;
  readonly onDeleted: () => void;
}): ReactNode {
  const owner = useIsOwner();
  const interrupt = useInterruptAgent(run.parent_chat_id, run.id);
  const mayInterrupt =
    run.supported_actions.includes('interrupt') &&
    (owner || run.source === 'smarteverything' || run.source === 'dsh');
  return (
    <View className="flex-row flex-wrap gap-2 px-4">
      {mayInterrupt ? (
        <Button
          label="Interrupt"
          icon="square"
          variant="outlined"
          loading={interrupt.isPending}
          onPress={() => {
            interrupt.mutate();
          }}
        />
      ) : null}
      <AgentChatDelete run={run} onDeleted={onDeleted} />
    </View>
  );
}

function Heading({
  run,
  onBack,
}: {
  readonly run: AiAgentRun;
  readonly onBack: (() => void) | null;
}): ReactNode {
  return (
    <ListRow
      title={run.title}
      subtitle={runStateLabel(run)}
      {...(onBack === null
        ? {}
        : {
            leading: <IconButton icon="chevronLeft" label="Back to activity" onPress={onBack} />,
          })}
    />
  );
}

export function AgentDetails({
  chatId,
  agentRunId,
  onBack,
  onDeleted,
}: {
  readonly chatId: string;
  readonly agentRunId: string;
  readonly onBack: (() => void) | null;
  readonly onDeleted: () => void;
}): ReactNode {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const detail = useAgentRun(chatId, agentRunId, cursor);
  if (detail.error !== null) {
    return (
      <LoadFailed
        what="this agent"
        retry={() => {
          background(detail.refetch(), 'detail.refetch_failed');
        }}
      />
    );
  }
  if (detail.data === undefined) return <RowsSkeleton />;
  const { run } = detail.data;
  return (
    <View className="gap-section-gap pb-3">
      <List>
        <Heading run={run} onBack={onBack} />
      </List>
      <FactRows run={run} />
      <Actions run={run} onDeleted={onDeleted} />
      <View className="px-4">
        <AgentMessage run={run} />
      </View>
      <RunUsage run={run} />
      <RunTrace detail={detail.data} onNext={setCursor} />
    </View>
  );
}
