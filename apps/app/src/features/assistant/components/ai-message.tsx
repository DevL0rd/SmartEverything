import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { WEB_SOURCES_KIND } from '@smarteverything/domain';
import { useIdiom } from '../../../design/platform';
import { endsMessage, startsMessage, type MessageItem } from '../data/thread';
import { stepsOfRow } from '../model/work-steps';
import { MessageWidgets } from '../widgets/message-widgets';
import { useMessageActions } from './message-actions';
import { MessageFrame } from './message-frame';
import { ReplyMeta } from './message-meta';
import { MessagePreview, MessageText, RunHeader } from './message-parts';
import { StreamedText } from './streamed-text';
import { Attachments } from './attachments';
import { SuggestionChips } from './suggestion-chips';
import { WebSources } from './web-sources';
import { webSourcesOf } from '../model/web-sources';
import { TurnNotice } from './turn-notice';
import { RecordedActivity } from './recorded-activity';
import { InlineReply } from './inline-reply';
import { hasReplyTimeline } from '../model/reply-timeline';

const HORIZONTAL_CONTENT = /```|^\s*\|.*\|\s*$/m;

function swipeable(item: MessageItem): boolean {
  return (
    item.row.embeds.every((embed) => embed.kind === WEB_SOURCES_KIND) &&
    !HORIZONTAL_CONTENT.test(item.row.text)
  );
}

function showsHeader(item: MessageItem): boolean {
  const startOfRun = item.position === 'first' || item.position === 'only';
  const origin = item.row.origin;
  const labelled = origin !== null && origin.source !== 'app' && origin.source !== 'voice';
  return startOfRun && (item.multiParty || labelled);
}

interface PartProps {
  readonly item: MessageItem;
  readonly actions: ReturnType<typeof useMessageActions>;
  readonly live: boolean;
  readonly streamed: boolean;
  readonly hideText: boolean;
}

function ReplyText({ item, actions, live, streamed, hideText }: PartProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  if (hideText) return null;
  if (hasReplyTimeline(item.row)) return <InlineReply item={item} live={live} actions={actions} />;
  if (streamed) {
    return <StreamedText item={item} actions={actions} live={live} />;
  }
  return item.row.text === '' ? null : (
    <MessageText item={item} actions={actions} selectable={pointer} />
  );
}

function ReplySuggestions({ item, live }: PartProps): ReactNode {
  if (live || !item.latestReply) {
    return null;
  }
  return <SuggestionChips row={item.row} />;
}

function ReplyBody(props: PartProps): ReactNode {
  const { item, live, hideText } = props;
  const { row } = item;
  const first = startsMessage(item);
  const last = endsMessage(item);
  const steps = useMemo(() => stepsOfRow(row.steps, row.step_states), [row.steps, row.step_states]);
  return (
    <View className="w-full gap-2.5">
      {live || hasReplyTimeline(row) ? null : <RecordedActivity steps={steps} />}
      {live || !first || row.attachments.length === 0 ? null : (
        <Attachments attachments={row.attachments} />
      )}
      <ReplyText {...props} />
      {live || (hasReplyTimeline(row) && !hideText) ? null : (
        <WebSources sources={webSourcesOf(row)} />
      )}
      {last ? <ReplyEnd {...props} /> : null}
    </View>
  );
}

function ReplyEnd(props: PartProps): ReactNode {
  const { row } = props.item;
  return (
    <>
      <MessageWidgets row={row} />
      {row.state === 'failed' ? <TurnNotice row={row} subject="reply" /> : null}
      <ReplySuggestions {...props} />
    </>
  );
}

export function AiMessage({
  item,
  hideText = false,
}: {
  readonly item: MessageItem;
  readonly hideText?: boolean;
}): ReactNode {
  const actions = useMessageActions(item);
  const { row } = item;
  const live = row.state === 'working';
  const [streamed] = useState(live);
  const quotable = swipeable(item);
  const swipeEnabled = !live && quotable;
  return (
    <MessageFrame
      actions={actions}
      preview={<MessagePreview item={item} className="bg-surface-1" />}
      align="start"
      bar={
        live || !endsMessage(item) ? null : <ReplyMeta row={row} onPress={actions.openDetails} />
      }
      swipeable={streamed || quotable}
      swipeEnabled={swipeEnabled}
      onQuote={() => {
        actions.run('quote');
      }}
    >
      <View className="w-full">
        {showsHeader(item) ? <RunHeader item={item} ai inset={false} /> : null}
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
