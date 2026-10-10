import type { ReactNode } from 'react';
import { useMemo } from 'react';
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
import { Attachments } from './attachments';
import { SuggestionChips } from './suggestion-chips';
import { useStreamingRenderers } from './streaming-context';
import { WebSources } from './web-sources';
import { TurnNotice } from './turn-notice';
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

function Body({
  item,
  actions,
}: {
  readonly item: MessageItem;
  readonly actions: ReturnType<typeof useMessageActions>;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const { row, latestReply } = item;
  const steps = useMemo(() => stepsOfRow(row.steps, row.step_states), [row.steps, row.step_states]);
  return (
    <View className="w-full gap-2.5">
      <WorkCard
        steps={steps}
        live={false}
        thinking={false}
        reasoning=""
        startedAt={null}
        reconnecting={false}
        onStop={null}
      />
      {row.attachments.length === 0 ? null : <Attachments attachments={row.attachments} />}
      {row.text === '' ? null : <MessageText item={item} actions={actions} selectable={pointer} />}
      <WebSources row={row} />
      <MessageWidgets row={row} />
      {row.state === 'failed' ? <TurnNotice row={row} subject="reply" /> : null}
      {latestReply ? (
        <ActionRow
          specs={actions.plan.row}
          run={actions.run}
          quick={actions.quick}
          list={actions.list}
          row={row}
          onMeta={actions.openDetails}
        />
      ) : null}
      {latestReply ? <SuggestionChips row={row} /> : null}
    </View>
  );
}

export function AiMessage({ item }: { readonly item: MessageItem }): ReactNode {
  const working = useStreamingRenderers()?.working ?? null;
  const actions = useMessageActions(item);
  const { row, latestReply } = item;
  const live = working !== null && row.state === 'working';
  return (
    <MessageFrame
      actions={actions}
      preview={<MessagePreview item={item} className="bg-surface-1" />}
      align="start"
      bar={latestReply || live ? null : <ReplyMeta row={row} onPress={actions.openDetails} />}
      swipeable={swipeable(item) && !live}
      reserve
      onQuote={() => {
        actions.run('quote');
      }}
    >
      <View className="w-full">
        {showsHeader(item) ? <RunHeader item={item} ai inset={false} /> : null}
        {live ? (
          <View className="w-full gap-2.5">
            {working(row)}
            <MessageWidgets row={row} />
          </View>
        ) : (
          <Body item={item} actions={actions} />
        )}
      </View>
    </MessageFrame>
  );
}
