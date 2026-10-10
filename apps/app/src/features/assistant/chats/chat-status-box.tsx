import type { ReactNode } from 'react';
import { memo, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { AssistantMessageRow, ChatToolItem } from '@smarteverything/domain';
import { useStatusDock } from '../data/chat-store';
import { WorkCard } from '../components/work-card';
import { statusIsLive, stepsOfTools } from '../model/work-steps';
import { stopChat } from './chat-actions';

const NO_TOOLS: readonly ChatToolItem[] = [];

interface Start {
  readonly id: string | null;
  readonly at: number | null;
}

function startOf(request: AssistantMessageRow | null): Start {
  return request === null
    ? { id: null, at: null }
    : { id: request.id, at: Date.parse(request.updated_at) };
}

function useStartedAt(request: AssistantMessageRow | null): number | null {
  const [start, setStart] = useState(() => startOf(request));
  if (start.id === (request?.id ?? null)) {
    return start.at;
  }
  const next = startOf(request);
  setStart(next);
  return next.at;
}

function ChatStatusDockBase({
  chatId,
  request,
}: {
  readonly chatId: string;
  readonly request: AssistantMessageRow | null;
}): ReactNode {
  const view = useStatusDock(chatId);
  const startedAt = useStartedAt(request);
  const steps = useMemo(() => stepsOfTools(view?.tools ?? NO_TOOLS), [view?.tools]);
  const state = view?.state ?? null;
  if (request === null || !statusIsLive(state)) {
    return null;
  }
  return (
    <View className="w-full max-w-reading self-center px-gutter pt-2">
      <ScrollView className="max-h-80" bounces={false}>
        <WorkCard
          steps={steps}
          live
          thinking={state === null || state === 'thinking'}
          reasoning={view?.reasoning ?? ''}
          startedAt={startedAt}
          reconnecting={view?.behind === true}
          onStop={() => {
            void stopChat(chatId);
          }}
        />
      </ScrollView>
    </View>
  );
}

export const ChatStatusDock = memo(ChatStatusDockBase);
