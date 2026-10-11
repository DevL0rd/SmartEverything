import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { WEB_SOURCES_KIND } from '@smarteverything/domain';
import { useIdiom } from '../../../design/platform';
import type { MessageItem } from '../data/thread';
import { stepsOfRow } from '../model/work-steps';
import { MessageWidgets } from '../widgets/message-widgets';
import { ActionRow } from './message-action-bars';
import { useMessageActions } from './message-actions';
import { MessageFrame } from './message-frame';
import { ReplyMeta } from './message-meta';
import { RunHeader } from './message-parts';
import { MessagePreview, MessageText } from './message-parts';
import { StreamedText } from './streamed-text';
import { Attachments } from './attachments';
import { SuggestionChips } from './suggestion-chips';
import { WebSources } from './web-sources';
import { TurnNotice } from './turn-notice';
import { useSettledMount } from './use-settled-mount';
import { WorkCard } from './work-card';

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
}

function ReplyText({ item, actions, live, streamed }: PartProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  if (streamed) {
    return <StreamedText item={item} actions={actions} live={live} />;
  }
  return item.row.text === '' ? null : (
    <MessageText item={item} actions={actions} selectable={pointer} />
  );
}

function ReplyActions({ item, actions, live, streamed }: PartProps): ReactNode {
  const ready = useSettledMount(!live, streamed);
  if (!ready || !item.latestReply) {
    return null;
  }
  return (
    <>
      <ActionRow
        specs={actions.plan.row}
        run={actions.run}
        quick={actions.quick}
        list={actions.list}
        row={item.row}
        onMeta={actions.openDetails}
      />
      <SuggestionChips row={item.row} />
    </>
  );
}

function ReplyBody(props: PartProps): ReactNode {
  const { item, live } = props;
  const { row } = item;
  const steps = useMemo(() => stepsOfRow(row.steps, row.step_states), [row.steps, row.step_states]);
  return (
    <View className="w-full gap-2.5">
      {live ? null : (
        <WorkCard
          steps={steps}
          live={false}
          thinking={false}
          reasoning=""
          startedAt={null}
          reconnecting={false}
          onStop={null}
        />
      )}
      {live || row.attachments.length === 0 ? null : <Attachments attachments={row.attachments} />}
      <ReplyText {...props} />
      {live ? null : <WebSources row={row} />}
      <MessageWidgets row={row} />
      {row.state === 'failed' ? <TurnNotice row={row} subject="reply" /> : null}
      <ReplyActions {...props} />
    </View>
  );
}

export function AiMessage({ item }: { readonly item: MessageItem }): ReactNode {
  const actions = useMessageActions(item);
  const { row, latestReply } = item;
  const live = row.state === 'working';
  const [streamed] = useState(live);
  const quotable = swipeable(item);
  const swipeEnabled = !live && quotable;
  return (
    <MessageFrame
      actions={actions}
      preview={<MessagePreview item={item} className="bg-surface-1" />}
      align="start"
      bar={latestReply || live ? null : <ReplyMeta row={row} onPress={actions.openDetails} />}
      swipeable={streamed || quotable}
      swipeEnabled={swipeEnabled}
      reserve
      onQuote={() => {
        actions.run('quote');
      }}
    >
      <View className="w-full">
        {showsHeader(item) ? <RunHeader item={item} ai inset={false} /> : null}
        <ReplyBody item={item} actions={actions} live={live} streamed={streamed} />
      </View>
    </MessageFrame>
  );
}
