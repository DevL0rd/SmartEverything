import { Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { joinParts } from '../../../format/text';
import { clock } from '../../../format/time';
import { useMoney, type Money } from '../../region';
import { useAssistantStatus } from '../data/assistant-data';
import { useAiChat } from '../data/chat-store';
import { useCanContinue } from '../data/retry';
import { continueMessage } from '../data/send';
import { marksStoppedTurn, type MessageItem } from '../data/thread';
import { NO_COST_REPORTED, replyCostOf, turnTime, type ReplyCost } from '../model/cost-note';
import { failedBubbleLabel } from '../model/turn-notice';
import {
  deliveryAnnouncement,
  deliveryNoteOf,
  deliveryOf,
  sentByVoice,
  type DeliveryMark,
} from '../model/delivery';
import { replyStatsOf } from '../model/chat-display';
import { replyTimeline } from '../model/reply-timeline';
import { isComputerEngine } from '../provider/computer-engine';
import {
  useVoiceTranscript,
  type MetaTranscript,
} from '../voice-message/voice-pill-transcript-state';
import { useTimeZone } from './message-parts';

interface Part {
  readonly key: string;
  readonly node: ReactNode;
}

const LINE = 'mt-0.75 h-4 flex-row items-center gap-1.25';
const HIT = 8;

function MetaText({
  children,
  label,
  className,
  tone = 'faint',
}: {
  readonly children: string;
  readonly label?: string;
  readonly className?: string;
  readonly tone?: 'faint' | 'variant';
}): ReactNode {
  return (
    <Text
      variant="caption"
      tone={tone}
      numberOfLines={1}
      className={cn('tabular shrink-0', className)}
      {...(label === undefined ? {} : { accessibilityLabel: label })}
    >
      {children}
    </Text>
  );
}

function Separated({ parts }: { readonly parts: readonly Part[] }): ReactNode {
  return parts.map((part, index) => (
    <Fragment key={part.key}>
      {index === 0 ? null : <MetaText className="opacity-60">·</MetaText>}
      {part.node}
    </Fragment>
  ));
}

function CostBar({ share, top }: { readonly share: number; readonly top: boolean }): ReactNode {
  const fill = { width: `${share * 100}%` } as const;
  return (
    <View className="h-0.75 w-3.5 overflow-hidden rounded-full bg-outline">
      <View
        style={fill}
        className={cn('h-full rounded-full', top ? 'bg-primary' : 'bg-on-surface-variant')}
      />
    </View>
  );
}

function costText(cost: ReplyCost, money: Money): string {
  if (cost.kind === 'unreported') return NO_COST_REPORTED;
  const figure = money.cost(cost.micros);
  return cost.kind === 'partial' ? `At least ${figure}, the rest not reported` : figure;
}

function CostPart({ cost, money }: { readonly cost: ReplyCost; readonly money: Money }): ReactNode {
  if (cost.kind === 'unreported') return <MetaText label={NO_COST_REPORTED}>–</MetaText>;
  const figure = money.cost(cost.micros);
  return (
    <View className="flex-row items-center gap-1">
      <MetaText>{cost.kind === 'partial' ? `${figure}+` : figure}</MetaText>
      {cost.share === null ? null : <CostBar share={cost.share} top={cost.top} />}
    </View>
  );
}

function useShownCost(item: MessageItem): ReplyCost | null {
  const chat = useAiChat(item.row.chat_id);
  const enabled = useAssistantStatus()?.settings.reply_cost !== false;
  const metered = chat === null || !isComputerEngine(chat.engine);
  const { stats } = item;
  return enabled && metered && stats !== null ? replyCostOf(stats.cost, item.costPeak) : null;
}

function TranscriptToggle({ transcript }: { readonly transcript: MetaTranscript }): ReactNode {
  return (
    <Interactive
      label={transcript.open ? 'Hide transcript' : 'Show transcript'}
      expanded={transcript.open}
      onPress={transcript.onToggle}
      hitSlop={HIT}
      className="h-4 justify-center"
      layerClassName="rounded-sm"
    >
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {transcript.open ? 'Hide transcript' : 'Transcript'}
      </Text>
    </Interactive>
  );
}

function useReplyStats(item: MessageItem, stopped: boolean): readonly string[] {
  const timeZone = useTimeZone();
  const time = clock(item.row.created_at, timeZone);
  if (item.stats === null) return stopped && !item.group ? [time] : [];
  return replyStatsOf(
    { group: item.group, state: item.row.state, stopped, stats: item.stats },
    time,
    turnTime,
  );
}

function useStoppedMark(item: MessageItem, stopped: boolean): string | null {
  const showSteps = useAssistantStatus()?.settings.activity_steps !== false;
  const tools = replyTimeline(item.row)?.parts.some((part) => part.kind === 'tool') === true;
  return stopped && !(showSteps && tools) ? failedBubbleLabel('stopped') : null;
}

interface MetaLine {
  readonly parts: readonly Part[];
  readonly label: string;
}

function metaLineOf(
  stats: readonly string[],
  cost: ReplyCost | null,
  mark: string | null,
  money: Money,
): MetaLine {
  return {
    parts: [
      ...stats.map((text) => ({ key: text, node: <MetaText>{text}</MetaText> })),
      ...(cost === null ? [] : [{ key: 'cost', node: <CostPart cost={cost} money={money} /> }]),
      ...(mark === null
        ? []
        : [{ key: 'stopped', node: <MetaText tone="variant">{mark}</MetaText> }]),
    ],
    label: joinParts([...stats, cost === null ? null : costText(cost, money), mark]),
  };
}

export function ReplyMeta({
  item,
  onPress,
}: {
  readonly item: MessageItem;
  readonly onPress: () => void;
}): ReactNode {
  const transcript = useVoiceTranscript(item.row.attachments);
  const money = useMoney();
  const cost = useShownCost(item);
  const stopped = marksStoppedTurn(item);
  const stats = useReplyStats(item, stopped);
  const mark = useStoppedMark(item, stopped);
  const line = metaLineOf(stats, cost, mark, money);
  if (line.parts.length === 0 && transcript === null) return null;
  return (
    <View className={LINE}>
      {line.parts.length === 0 ? null : (
        <Interactive
          label={`Message details. ${line.label}`}
          onPress={onPress}
          hitSlop={HIT}
          className="h-4 min-w-0 shrink justify-center"
          layerClassName="rounded-sm"
        >
          <View className="min-w-0 flex-row items-center gap-1.25">
            <Separated parts={line.parts} />
          </View>
        </Interactive>
      )}
      {transcript === null ? null : <TranscriptToggle transcript={transcript} />}
    </View>
  );
}

export function DeliveryGlyph({ mark }: { readonly mark: DeliveryMark }): ReactNode {
  switch (mark) {
    case 'sending':
    case 'queued':
      return <Icon name="clock" size={16} tone="faint" />;
    case 'sent':
      return <Icon name="check" size={16} tone="faint" />;
    case 'delivered':
      return <Icon name="checkCheck" size={16} tone="faint" />;
    case 'seen':
      return <Icon name="checkCheck" size={16} tone="primary" />;
    case 'failed':
      return <View className="size-1.5 rounded-full bg-critical" />;
    case 'interrupted':
      return null;
  }
}

function useRetry(row: AssistantMessageRow, mark: DeliveryMark): (() => void) | null {
  const failed = mark === 'failed';
  const continuable = useCanContinue(failed ? row : null);
  if (!failed || !continuable) return null;
  return (): void => {
    background(continueMessage(row), 'message.continue_failed');
  };
}

function RetryAction({ onPress }: { readonly onPress: () => void }): ReactNode {
  return (
    <Interactive
      label="Retry"
      onPress={onPress}
      hitSlop={HIT}
      className="h-4 justify-center"
      layerClassName="rounded-sm"
    >
      <Text variant="caption" tone="variant" numberOfLines={1}>
        Retry
      </Text>
    </Interactive>
  );
}

function OwnMark({
  mark,
  note,
}: {
  readonly mark: DeliveryMark;
  readonly note: string | null;
}): ReactNode {
  return (
    <>
      <DeliveryGlyph mark={mark} />
      {note === null ? null : (
        <Text variant="caption" tone={mark === 'failed' ? 'critical' : 'variant'} numberOfLines={1}>
          {note}
        </Text>
      )}
    </>
  );
}

export function MyMeta({ item }: { readonly item: MessageItem }): ReactNode {
  const timeZone = useTimeZone();
  const transcript = useVoiceTranscript(item.row.attachments);
  const { row } = item;
  const mark = deliveryOf(row, item.waiting);
  const retry = useRetry(row, mark);
  const time = clock(row.created_at, timeZone);
  const note = marksStoppedTurn(item) ? failedBubbleLabel('stopped') : deliveryNoteOf(row, mark);
  return (
    <View className={cn(LINE, 'self-end pr-1')}>
      {transcript === null ? null : <TranscriptToggle transcript={transcript} />}
      <View
        accessible
        accessibilityLabel={deliveryAnnouncement(row, mark, time)}
        className="flex-row items-center gap-1"
      >
        {sentByVoice(row) ? <Icon name="mic" size={16} tone="faint" /> : null}
        <MetaText>{time}</MetaText>
        <OwnMark mark={mark} note={note} />
      </View>
      {retry === null ? null : (
        <>
          <MetaText className="opacity-60">·</MetaText>
          <RetryAction onPress={retry} />
        </>
      )}
    </View>
  );
}
