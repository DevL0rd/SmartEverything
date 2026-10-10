import type { ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import type { Engine } from '@smarteverything/domain';
import { ProgressBar } from '../../../components/charts';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { joinParts } from '../../../format/text';
import { useMoney } from '../../region';
import { useFooterFacts } from '../data/chat-store';
import { contextText } from '../data/cost';
import { contextTone, filesLabel, repliesLabel, type FooterFacts } from '../model/chat-footer';
import { useModelChoice } from '../picker/model-label';
import { useChatModel } from './chat-model';

function ContextMeter({
  percent,
  window,
}: {
  readonly percent: number;
  readonly window: string | null;
}): ReactNode {
  const used = `${String(percent)} %`;
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="w-12">
        <ProgressBar progress={percent / 100} colour={contextTone(percent)} label="Context used" />
      </View>
      <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
        {window === null ? used : `${used} of ${window}`}
      </Text>
    </View>
  );
}

function speak(facts: FooterFacts, cost: string, model: string, window: string | null): string {
  return [
    facts.costMicros > 0 ? `Chat total ${cost}` : null,
    facts.context === null
      ? null
      : `Context ${String(facts.context)} % used${window === null ? '' : ` of ${window}`}`,
    model,
    facts.replies > 0 ? repliesLabel(facts.replies) : null,
    facts.files > 0 ? filesLabel(facts.files) : null,
  ]
    .filter((part): part is string => part !== null)
    .join('. ');
}

function Strip({
  engine,
  facts,
  onPress,
}: {
  readonly engine: Engine;
  readonly facts: FooterFacts;
  readonly onPress: () => void;
}): ReactNode {
  const money = useMoney();
  const model = useChatModel(engine);
  const length = useModelChoice(engine.model)?.contextLength ?? null;
  const window = contextText(length)?.replace(' context', '') ?? null;
  const cost = money.cost(facts.costMicros);
  const counts = joinParts([
    facts.replies > 0 ? repliesLabel(facts.replies) : null,
    facts.files > 0 ? filesLabel(facts.files) : null,
  ]);
  return (
    <Interactive
      label={`Chat details. ${speak(facts, cost, model.shortName, window)}`}
      onPress={onPress}
      className="h-8 w-full justify-center rounded-md px-2"
      layerClassName="rounded-md"
    >
      <View className="flex-row items-center gap-3">
        {facts.costMicros > 0 ? (
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular shrink-0">
            {cost}
          </Text>
        ) : null}
        {facts.context === null ? null : (
          <View className="shrink-0">
            <ContextMeter percent={facts.context} window={window} />
          </View>
        )}
        <Text
          variant="caption"
          tone="variant"
          numberOfLines={1}
          className="min-w-0 shrink flex-1 text-right"
        >
          {joinParts([model.shortName, counts])}
        </Text>
      </View>
    </Interactive>
  );
}

function ChatFooterStripBase({
  chatId,
  engine,
  onPress,
}: {
  readonly chatId: string;
  readonly engine: Engine;
  readonly onPress: () => void;
}): ReactNode {
  const facts = useFooterFacts(chatId);
  return facts === null ? null : <Strip engine={engine} facts={facts} onPress={onPress} />;
}

export const ChatFooterStrip = memo(
  ChatFooterStripBase,
  (left, right) =>
    left.chatId === right.chatId &&
    left.onPress === right.onPress &&
    left.engine.model === right.engine.model &&
    left.engine.effort === right.engine.effort,
);
