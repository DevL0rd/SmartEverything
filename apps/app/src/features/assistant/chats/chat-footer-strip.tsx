import type { ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import type { AiChatRow, AiHarnessSession } from '@smarteverything/domain';
import { ProgressBar } from '../../../components/charts';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useMoney } from '../../region';
import { useChatHarness } from '../data/harness';
import { useFooterFacts } from '../data/chat-store';
import { contextText } from '../data/cost';
import { contextTone, type FooterFacts } from '../model/chat-footer';
import { useModelChoice } from '../picker/model-label';
import { CompactChatButton } from './compact-chat-button';

function ContextMeter({
  percent,
  window,
  state,
}: {
  readonly percent: number;
  readonly window: string | null;
  readonly state: NonNullable<AiHarnessSession['context']>['state'] | undefined;
}): ReactNode {
  const used = `${String(percent)} %`;
  const label =
    state === 'compacting'
      ? 'Compacting · last request'
      : state === 'stale'
        ? 'Last request'
        : 'Context';
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
        {window === null ? `${label} ${used}` : `${label} ${used} of ${window}`}
      </Text>
      <ProgressBar progress={percent / 100} colour={contextTone(percent)} label={`${label} used`} />
    </View>
  );
}

function TotalCost({
  chat,
  facts,
}: {
  readonly chat: AiChatRow;
  readonly facts: FooterFacts;
}): ReactNode {
  const money = useMoney();
  const cost =
    facts.costMicros > 0
      ? `${money.cost(facts.costMicros)}${chat.cost_incomplete === true ? ' + unknown' : ''}`
      : 'Unavailable';
  return (
    <View className="shrink-0 items-end gap-0.5">
      <Text variant="caption" tone="variant">
        Total cost
      </Text>
      <Text variant="caption" tone="variant" className="tabular">
        {cost}
      </Text>
    </View>
  );
}

function contextCapacity(
  context: AiHarnessSession['context'],
  discovered: number | null,
): number | null {
  return context?.capacity_tokens ?? discovered;
}

function ChatFooterStripBase({
  chat,
  blocked,
  onPress,
}: {
  readonly chat: AiChatRow;
  readonly blocked: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const stored = useFooterFacts(chat.id);
  const facts = stored ?? {
    costMicros: chat.cost_micros,
    context: chat.context_percent,
    replies: 0,
    files: 0,
  };
  const native = useChatHarness(chat.id, chat.engine.kind === 'dsh').data?.context;
  const discovered = useModelChoice(chat.engine.model)?.contextLength ?? null;
  const length = contextCapacity(native, discovered);
  const window = contextText(length)?.replace(' context', '') ?? null;
  return (
    <View className="flex-row items-center gap-1">
      <CompactChatButton chat={chat} blocked={blocked} />
      <Interactive
        label="Chat details, context and total cost"
        onPress={onPress}
        className="min-h-touch-min min-w-0 flex-1 justify-center rounded-md px-1"
        layerClassName="rounded-md"
      >
        <View className="flex-row items-center gap-3">
          {facts.context === null ? (
            <Text variant="caption" tone="variant" className="min-w-0 flex-1">
              {window === null ? 'Context unavailable' : `Context ${window} · awaiting usage`}
            </Text>
          ) : (
            <ContextMeter percent={facts.context} window={window} state={native?.state} />
          )}
          <TotalCost chat={chat} facts={facts} />
        </View>
      </Interactive>
    </View>
  );
}

export const ChatFooterStrip = memo(ChatFooterStripBase);
