import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow } from '@smarteverything/domain';
import { AgentsSection } from '../components/agent-chat-info';
import { useFeatureSupport } from '../data/feature-support';
import { BackgroundGroup, useActiveImageOperations } from './background-ops';
import { useDetailsDeleted } from './details-scope';
import { WorkGroup } from './work-status';

export function useAgentsSupported(chat: AiChatRow): boolean {
  const engine = chat.engine;
  const supported = useFeatureSupport(
    'agents',
    engine.kind === 'dsh' ? engine.execution_target : null,
  );
  return engine.kind === 'dsh' ? supported : true;
}

export function ActivityTab({
  chat,
  runId,
  onRun,
}: {
  readonly chat: AiChatRow;
  readonly runId: string | null;
  readonly onRun: (runId: string | null) => void;
}): ReactNode {
  const agents = useAgentsSupported(chat);
  const operations = useActiveImageOperations(chat.id);
  const onDeleted = useDetailsDeleted();
  const pushed = agents && runId !== null;
  const quiet = operations.length === 0 && chat.engine.kind !== 'dsh';
  return (
    <View className="gap-section-gap pb-3">
      {agents ? (
        <AgentsSection
          chat={chat}
          runId={runId}
          quiet={quiet}
          onRun={onRun}
          onDeleted={onDeleted}
        />
      ) : null}
      {pushed || operations.length === 0 ? null : <BackgroundGroup operations={operations} />}
      {pushed ? null : <WorkGroup chat={chat} />}
    </View>
  );
}
