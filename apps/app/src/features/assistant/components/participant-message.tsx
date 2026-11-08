import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { clock } from '../../../format/time';
import { useRow } from '../../../store/selectors';
import { pluginIcon } from '../../plugins';
import { useAiChat } from '../data/chat-store';
import { endsMessage, startsMessage, type MessageItem } from '../data/thread';
import type { ItemOrigin, Participant } from '../model/participant';
import { hasReplyTimeline } from '../model/reply-timeline';
import { webSourcesOf } from '../model/web-sources';
import { stepsOfRow } from '../model/work-steps';
import { MessageWidgets } from '../widgets/message-widgets';
import { Attachments } from './attachments';
import { INK_TEXT } from './chat-surface';
import { InlineReply } from './inline-reply';
import { useMessageActions } from './message-actions';
import { MessageFrame } from './message-frame';
import { ReplyMeta } from './message-meta';
import { Markdown } from './markdown/markdown';
import { mentionRuleOf } from './markdown/mention-runs';
import { messageLabel, shownText, useTimeZone } from './message-parts';
import { ParticipantTrigger } from './participant-menu';
import { QuoteStrip, quoteSourceOf } from './quote-strip';
import { RecordedActivity } from './recorded-activity';
import { SpeakerAvatar } from './speaker-avatar';
import { StreamedText } from './streamed-text';
import { SuggestionChips } from './suggestion-chips';
import { TurnNotice } from './turn-notice';
import { WebSources } from './web-sources';

interface PartProps {
  readonly item: MessageItem;
  readonly actions: ReturnType<typeof useMessageActions>;
  readonly live: boolean;
  readonly streamed: boolean;
  readonly hideText: boolean;
}

const ORIGIN_HIT = 8;

export function startsRun(item: MessageItem): boolean {
  return item.position === 'first' || item.position === 'only';
}

export function shownParticipant(item: MessageItem): Participant | null {
  const { participant } = item;
  if (participant === null) return null;
  return item.group || !item.host ? participant : null;
}

function OriginText({ icon, text }: { readonly icon: IconName; readonly text: string }): ReactNode {
  return (
    <View className="min-w-0 shrink flex-row items-center gap-0.75">
      <Icon name={icon} size={16} tone="faint" />
      <Text variant="caption" tone="faint" numberOfLines={1} className="min-w-0 shrink">
        {text}
      </Text>
    </View>
  );
}

function PluginOrigin({ pluginId }: { readonly pluginId: string | null }): ReactNode {
  const plugin = useRow('plugins', pluginId);
  return (
    <Icon name={plugin === null ? 'puzzle' : pluginIcon(plugin.manifest)} size={16} tone="faint" />
  );
}

function RelayedOrigin({
  origin,
  sender,
}: {
  readonly origin: ItemOrigin;
  readonly sender: string;
}): ReactNode {
  const chat = useAiChat(origin.chatId);
  const { chatId } = origin;
  const title = chat?.title ?? origin.name;
  if (title === null || title === sender) return null;
  const text = <OriginText icon="messageCircle" text={`in ${title}`} />;
  if (chatId === null) return text;
  return (
    <Interactive
      label={`Open ${title}`}
      onPress={() => {
        router.push(href.assistantChat(chatId));
      }}
      hitSlop={ORIGIN_HIT}
      className="min-w-0 shrink"
      layerClassName="rounded-sm"
    >
      {text}
    </Interactive>
  );
}

function OriginMark({
  origin,
  sender,
}: {
  readonly origin: ItemOrigin | null;
  readonly sender: string;
}): ReactNode {
  switch (origin?.kind) {
    case undefined:
      return null;
    case 'voice':
      return <OriginText icon="mic" text="by voice" />;
    case 'schedule':
      return <OriginText icon="clock" text="Scheduled" />;
    case 'plugin':
      return <PluginOrigin pluginId={origin.pluginId} />;
    case 'camera':
      return <Icon name="camera" size={16} tone="faint" />;
    case 'relayed':
      return <RelayedOrigin origin={origin} sender={sender} />;
  }
}

function RunHeader({
  item,
  participant,
}: {
  readonly item: MessageItem;
  readonly participant: Participant;
}): ReactNode {
  const timeZone = useTimeZone();
  return (
    <View className="mb-0.5 h-5 min-w-0 flex-row items-center gap-1.5 self-stretch">
      <ParticipantTrigger
        participant={participant}
        chatId={item.row.chat_id}
        className="min-w-0 shrink"
      >
        <Text
          variant="label"
          numberOfLines={1}
          className={cn('min-w-0', INK_TEXT[participant.ink])}
        >
          {participant.name}
        </Text>
      </ParticipantTrigger>
      {item.group ? (
        <Text variant="caption" tone="faint" className="shrink-0 tabular">
          {startsMessage(item) ? clock(item.row.created_at, timeZone) : 'Continued'}
        </Text>
      ) : null}
      <OriginMark origin={item.origin} sender={participant.name} />
    </View>
  );
}

function SettledText({ item, actions }: Pick<PartProps, 'item' | 'actions'>): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const timeZone = useTimeZone();
  const text = shownText(item);
  return text === '' ? null : (
    <View accessible accessibilityLabel={messageLabel(item, timeZone)} {...actions.accessibility}>
      <Markdown text={text} selectable={pointer} mentions={mentionRuleOf(item.mentions)} />
    </View>
  );
}

function ReplyText({ item, actions, live, streamed, hideText }: PartProps): ReactNode {
  if (hideText) return null;
  if (hasReplyTimeline(item.row)) return <InlineReply item={item} live={live} actions={actions} />;
  if (streamed) return <StreamedText item={item} actions={actions} live={live} />;
  return <SettledText item={item} actions={actions} />;
}

function ReplyAttachments({ item, live }: PartProps): ReactNode {
  const { attachments, chat_id: chatId } = item.row;
  return live || !startsMessage(item) || attachments.length === 0 ? null : (
    <Attachments attachments={attachments} chatId={chatId} />
  );
}

function ReplyEnd(props: PartProps): ReactNode {
  const { item, live } = props;
  const { row } = item;
  return (
    <>
      <MessageWidgets row={row} />
      {row.state === 'failed' && row.reason_code !== 'stopped' ? <TurnNotice row={row} /> : null}
      {live || !item.latestReply ? null : <SuggestionChips row={row} />}
    </>
  );
}

function ReplyQuote({ item }: { readonly item: MessageItem }): ReactNode {
  const { quote } = item;
  return quote === null || !startsMessage(item) ? null : (
    <QuoteStrip quote={quote} source={quoteSourceOf(quote, item.quoted, false)} />
  );
}

function ReplyBody(props: PartProps): ReactNode {
  const { item, live, hideText } = props;
  const { row } = item;
  const timeline = hasReplyTimeline(row);
  const steps = useMemo(() => stepsOfRow(row.steps, row.step_states), [row.steps, row.step_states]);
  return (
    <View className="w-full gap-2">
      <ReplyQuote item={item} />
      {live || timeline ? null : <RecordedActivity messageId={row.id} steps={steps} />}
      <ReplyAttachments {...props} />
      <ReplyText {...props} />
      {live || (timeline && !hideText) ? null : <WebSources sources={webSourcesOf(row)} />}
      {endsMessage(item) ? <ReplyEnd {...props} /> : null}
    </View>
  );
}

function ParticipantFrame({
  item,
  participant,
  hideText,
}: {
  readonly item: MessageItem;
  readonly participant: Participant | null;
  readonly hideText: boolean;
}): ReactNode {
  const actions = useMessageActions(item);
  const live = item.row.state === 'working';
  const [streamed] = useState(live);
  return (
    <MessageFrame
      actions={actions}
      align="start"
      bar={
        live || !endsMessage(item) ? null : <ReplyMeta item={item} onPress={actions.openDetails} />
      }
      swipeEnabled={!live}
      onQuote={() => {
        actions.run('quote');
      }}
    >
      <View className="w-full">
        {participant !== null && startsRun(item) ? (
          <RunHeader item={item} participant={participant} />
        ) : null}
        <ReplyBody
          item={item}
          actions={actions}
          live={live}
          streamed={streamed}
          hideText={hideText}
        />
      </View>
    </MessageFrame>
  );
}

export function ParticipantMessage({
  item,
  hideText = false,
}: {
  readonly item: MessageItem;
  readonly hideText?: boolean;
}): ReactNode {
  const participant = shownParticipant(item);
  const frame = <ParticipantFrame item={item} participant={participant} hideText={hideText} />;
  if (participant === null) return frame;
  return (
    <View className="flex-row items-start gap-2">
      <View className="w-6">
        {startsRun(item) ? (
          <ParticipantTrigger participant={participant} chatId={item.row.chat_id}>
            <SpeakerAvatar participant={participant} live={item.row.state === 'working'} />
          </ParticipantTrigger>
        ) : null}
      </View>
      <View className="min-w-0 flex-1">{frame}</View>
    </View>
  );
}
