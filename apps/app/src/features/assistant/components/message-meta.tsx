import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import { joinParts } from '../../../format/text';
import { useAssistantStatus } from '../data/assistant-data';
import { useMoney } from '../../region';
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
  const showCost = useAssistantStatus()?.settings.reply_cost !== false;
  const money = useMoney();
  const time = clock(row.created_at, timeZone);
  const cost = showCost && row.cost_micros > 0 ? money.cost(row.cost_micros) : null;
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

export type DeliveryMark = 'sent' | 'seen' | 'waiting' | 'failed';

export function deliveryOf(row: AssistantMessageRow, waiting: boolean): DeliveryMark {
  if (row.state === 'failed') {
    return 'failed';
  }
  if (waiting) {
    return 'waiting';
  }
  return row.state === 'working' || row.state === 'answered' ? 'seen' : 'sent';
}

function MarkIcon({ mark }: { readonly mark: DeliveryMark }): ReactNode {
  switch (mark) {
    case 'sent':
      return <Icon name="check" size={16} tone="variant" />;
    case 'seen':
      return <Icon name="checkCheck" size={16} tone="primary" />;
    case 'waiting':
      return <Icon name="clock" size={16} tone="variant" />;
    case 'failed':
      return <Icon name="alert" size={16} tone="critical" />;
  }
}

const MARK_LABEL: Readonly<Record<DeliveryMark, string>> = {
  sent: 'Sent',
  seen: 'Seen by the assistant',
  waiting: 'Sends after this reply',
  failed: 'Not sent',
};

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
  const label =
    mark === 'failed'
      ? failedBubbleLabel(row.reason_code)
      : mark === 'waiting'
        ? MARK_LABEL.waiting
        : null;
  return (
    <View
      accessibilityLabel={`${joinParts([via, clock(row.created_at, timeZone)])}. ${MARK_LABEL[mark]}`}
      className="mr-1.5 mt-1 flex-row items-center gap-1 self-end"
    >
      <Text variant="caption" tone="variant" className="tabular">
        {joinParts([via, clock(row.created_at, timeZone)])}
      </Text>
      <MarkIcon mark={mark} />
      {label === null ? null : (
        <Text variant="caption" tone={mark === 'failed' ? 'critical' : 'variant'}>
          {label}
        </Text>
      )}
    </View>
  );
}
