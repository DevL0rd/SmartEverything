import type { ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import type { AiChatRow } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useSizeClass } from '../../../design/size-class';
import { joinParts } from '../../../format/text';
import { useMoney } from '../../region';
import { ContextRing } from '../components/context-ring';
import { useAssistantStatus } from '../data/assistant-data';
import { useFooterFacts } from '../data/chat-store';
import { useContextUsage } from '../data/context-usage';
import {
  HARNESS_FAILURE_ACTION_LABEL,
  type HarnessFailureAction,
} from '../details/harness-failure';
import { useFailureHandlers, useHarnessFailure } from '../details/use-harness-failure';
import { compactShown, type ExecutionLine } from '../model/chat-footer';
import { machineSwitchOf } from '../model/harness-handoff';
import { isComputerEngine } from '../provider/computer-engine';
import { CompactChatButton } from './compact-chat-button';
import { useExecutionLine } from './use-execution-line';

function useCostText(chat: AiChatRow): string | null {
  const money = useMoney();
  const shown = useAssistantStatus()?.settings.reply_cost !== false;
  const micros = useFooterFacts(chat.id)?.costMicros ?? chat.cost_micros;
  if (!shown || isComputerEngine(chat.engine) || micros <= 0) return null;
  return `${money.cost(micros)}${chat.cost_incomplete === true ? ' + unknown' : ''}`;
}

function CancelSwitch({ onCancel }: { readonly onCancel: () => void }): ReactNode {
  return (
    <Interactive
      label="Cancel machine switch"
      onPress={onCancel}
      className="min-h-touch-min justify-center rounded-sm px-2"
      layerClassName="rounded-sm"
    >
      <Text variant="footnote" tone="primary">
        Cancel
      </Text>
    </Interactive>
  );
}

function FailureAction({
  action,
  onPress,
}: {
  readonly action: HarnessFailureAction;
  readonly onPress: () => void;
}): ReactNode {
  const label = HARNESS_FAILURE_ACTION_LABEL[action];
  return (
    <Interactive
      label={label}
      onPress={onPress}
      className="min-h-touch-min justify-center rounded-sm px-2"
      layerClassName="rounded-sm"
    >
      <Text variant="footnote" tone="primary" numberOfLines={1}>
        {label}
      </Text>
    </Interactive>
  );
}

function Reading({
  where,
  percent,
}: {
  readonly where: ExecutionLine;
  readonly percent: number | null;
}): ReactNode {
  return (
    <>
      <View
        aria-hidden
        pointerEvents="none"
        className="min-w-0 flex-1 flex-row items-center gap-1.5 px-1"
      >
        {where.warning ? <Icon name="warning" size={16} tone="warning" /> : null}
        <Text variant="footnote" tone="variant" numberOfLines={1} className="shrink">
          {where.text}
        </Text>
      </View>
      {percent === null ? null : (
        <View aria-hidden pointerEvents="none" className="flex-row items-center gap-1.5 px-1">
          <ContextRing percent={percent} size={16} />
          <Text variant="footnote" tone="variant" className="tabular">
            {`${String(percent)}%`}
          </Text>
        </View>
      )}
    </>
  );
}

function CostAndHandle({ cost }: { readonly cost: string | null }): ReactNode {
  return (
    <View aria-hidden pointerEvents="none" className="flex-row items-center gap-1.5 px-1">
      {cost === null ? null : (
        <Text variant="footnote" tone="variant" className="tabular">
          {cost}
        </Text>
      )}
      <Icon name="chevronUp" size={16} tone="variant" />
    </View>
  );
}

interface StripAction {
  readonly action: HarnessFailureAction;
  readonly onPress: () => void;
}

function useStripLine(chat: AiChatRow): {
  readonly where: ExecutionLine;
  readonly action: StripAction | null;
} {
  const executing = useExecutionLine(chat);
  const failure = useHarnessFailure(chat);
  const handlerOf = useFailureHandlers(chat);
  if (failure === null || machineSwitchOf(chat.pending_execution_target).kind !== 'idle') {
    return { where: executing, action: null };
  }
  const onPress = failure.action === null ? null : handlerOf(failure.action);
  return {
    where: { text: failure.title, warning: true, cancel: null },
    action:
      failure.action === null || onPress === null ? null : { action: failure.action, onPress },
  };
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
  const short = useSizeClass().height === 'compact';
  const { where, action } = useStripLine(chat);
  const context = useContextUsage(chat);
  const cost = useCostText(chat);
  if (short) return null;
  const label = joinParts([
    'Chat details',
    where.text,
    context.percent === null ? null : `${context.label} ${String(context.percent)} %`,
    cost,
  ]);
  return (
    <View className="min-h-touch-min flex-row items-center">
      <Interactive
        label={label}
        onPress={onPress}
        className="absolute inset-0 rounded-md"
        layerClassName="rounded-md"
      >
        <View />
      </Interactive>
      <Reading where={where} percent={context.percent} />
      {where.cancel === null ? null : <CancelSwitch onCancel={where.cancel} />}
      {action === null ? null : <FailureAction {...action} />}
      {compactShown(context.percent) ? <CompactChatButton chat={chat} blocked={blocked} /> : null}
      <CostAndHandle cost={cost} />
    </View>
  );
}

export const ChatFooterStrip = memo(ChatFooterStripBase);
