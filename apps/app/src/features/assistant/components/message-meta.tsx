import { useAiChat } from '../data/chat-store';
import { isComputerEngine } from '../provider/computer-engine';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { isInterruption, type AssistantMessageRow } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import { joinParts } from '../../../format/text';
import { useAssistantStatus } from '../data/assistant-data';
import { useMoney } from '../../region';
import { DELIVERY_LABEL, type DeliveryMark } from '../model/delivery';
import { failedBubbleLabel } from '../model/turn-notice';
import { useTimeZone } from './message-parts';

export function ReplyMeta({
  row,
  onPress,
}: {
  readonly row: AssistantMessageRow;
  readonly onPress: () => void;
}): ReactNode {
  const timeZone = useTimeZone();
  const chat = useAiChat(row.chat_id);
  const metered = chat === null || !isComputerEngine(chat.engine);
  const showCost = useAssistantStatus()?.settings.reply_cost !== false && metered;
  const money = useMoney();
  const time = clock(row.created_at, timeZone);
  const cost = showCost ? replyCost(row, money.cost) : null;
  return (
    <Interactive
      label={`Message details. ${joinParts([time, cost])}`}
      onPress={onPress}
      className="min-h-touch-min min-w-0 max-w-full shrink justify-center rounded-sm px-2"
      layerClassName="rounded-sm"
    >
      <View className="min-w-0 max-w-full flex-row gap-1">
        <MetaText className="shrink-0">{time}</MetaText>
        {cost === null ? null : <MetaPart className="shrink-0">{cost}</MetaPart>}
      </View>
    </Interactive>
  );
}

function MetaPart({
  className,
  children,
}: {
  readonly className: string;
  readonly children: string;
}): ReactNode {
  return (
    <>
      <MetaText className="shrink-0">·</MetaText>
      <MetaText className={className}>{children}</MetaText>
    </>
  );
}

function MetaText({
  className,
  children,
}: {
  readonly className: string;
  readonly children: string;
}): ReactNode {
  return (
    <Text variant="caption" tone="variant" numberOfLines={1} className={`tabular ${className}`}>
      {children}
    </Text>
  );
}

function MarkIcon({
  mark,
  quiet,
}: {
  readonly mark: DeliveryMark;
  readonly quiet: boolean;
}): ReactNode {
  switch (mark) {
    case 'sent':
      return <Icon name="check" size={16} tone="variant" />;
    case 'seen':
      return <Icon name="checkCheck" size={16} tone="primary" />;
    case 'queued':
      return <Icon name="clock" size={16} tone="variant" />;
    case 'delivered':
      return <Icon name="check" size={16} tone="variant" />;
    case 'failed':
      return quiet ? (
        <Icon name="square" size={16} tone="variant" />
      ) : (
        <Icon name="alert" size={16} tone="critical" />
      );
  }
}

export function MyMeta({
  row,
  mark,
  via,
}: {
  readonly row: AssistantMessageRow;
  readonly mark: DeliveryMark;
  readonly via: string | null;
}): ReactNode {
  const timeZone = useTimeZone();
  const quiet = mark === 'failed' && isInterruption(row.reason_code);
  const label =
    mark === 'failed'
      ? failedBubbleLabel(row.reason_code)
      : mark === 'queued' || mark === 'delivered'
        ? DELIVERY_LABEL[mark]
        : null;
  return (
    <View
      accessibilityLabel={`${joinParts([via, clock(row.created_at, timeZone)])}. ${DELIVERY_LABEL[mark]}`}
      className="mr-1.5 mt-1 flex-row items-center gap-1 self-end"
    >
      <Text variant="caption" tone="variant" className="tabular">
        {joinParts([via, clock(row.created_at, timeZone)])}
      </Text>
      <MarkIcon mark={mark} quiet={quiet} />
      {label === null ? null : (
        <Text variant="caption" tone={mark === 'failed' && !quiet ? 'critical' : 'variant'}>
          {label}
        </Text>
      )}
    </View>
  );
}

function replyCost(row: AssistantMessageRow, money: (micros: number) => string): string | null {
  if (row.cost_incomplete === true)
    return row.cost_micros === 0 ? 'Cost unavailable' : `${money(row.cost_micros)} + unavailable`;
  return row.cost_micros > 0 ? money(row.cost_micros) : null;
}
