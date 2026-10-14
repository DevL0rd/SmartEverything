import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useMotion } from '../../../design/motion';
import { WORK_COLLAPSE } from './thread-motion';
import { Interactive } from '../../../components/interactive';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { useChatMessages } from '../data/chat-store';
import { useOlderMessages, mergedRows } from '../data/history';
import { useAssistantStatus } from '../data/assistant-data';
import { replyTimeline } from '../model/reply-timeline';
import { inlineTimeline, type InlineTimelinePart } from '../model/inline-timeline';
import type { MessageItem } from '../data/thread';
import { useImageOperations } from '../images/data/image-queries';
import { ImageOperationBubble } from '../images/components/image-receipts';
import { resultMessageId } from '../images/model/image-thread';
import type { MessageActions } from './message-actions';
import { readableText } from './markdown/parse';
import { StreamBlocks } from './streamed-text';
import { streamView, finalView } from '../model/stream-view';
import { usePendingDeletes } from '../data/pending-deletes';
import { InlineTool } from './inline-tool';
import { inlineImageItem, renderInlineImageMessage } from './inline-image-message';
import { WebSources } from './web-sources';
import { timelineSources, webSourcesOf, type NumberedSource } from '../model/web-sources';

function Thinking({ text, live }: { readonly text: string; readonly live: boolean }): ReactNode {
  const [open, setOpen] = useState(false);
  const motion = useMotion();
  return (
    <View className="gap-1">
      <View className="min-h-touch-min max-w-full justify-center self-start">
        <Interactive
          label={open ? 'Hide thinking' : 'Show thinking'}
          checked={open}
          hitSlop={10}
          onPress={() => {
            setOpen(!open);
          }}
          className="min-h-6 flex-row items-center gap-1.5 self-start rounded-sm px-1"
        >
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} tone="variant" />
          <Text variant="caption" tone="variant">
            {live ? 'Thinking…' : 'Thinking'}
          </Text>
        </Interactive>
      </View>
      {open ? (
        <Animated.View {...(motion.reduced ? {} : { layout: WORK_COLLAPSE })}>
          <Text variant="footnote" tone="variant" selectable>
            {text}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
function InlineImage({
  chatId,
  operationId,
}: {
  readonly chatId: string;
  readonly operationId: string;
}): ReactNode {
  const operations = useImageOperations(chatId);
  const rows = useChatMessages(chatId);
  const older = useOlderMessages(chatId);
  const hidden = usePendingDeletes();
  const receipt = operations.data?.find((entry) => entry.id === operationId);
  if (
    receipt === undefined ||
    receipt.message_deleted === true ||
    hidden.has(resultMessageId(receipt) ?? receipt.id)
  )
    return null;
  const saved = mergedRows(rows, older.rows).find((row) => row.id === resultMessageId(receipt));
  return (
    <ImageOperationBubble
      item={{
        type: 'image-operation',
        key: `image-operation-${receipt.id}`,
        receipt,
        message: saved === undefined ? null : inlineImageItem(saved),
      }}
      flash={false}
      renderMessage={renderInlineImageMessage}
    />
  );
}
function ToolPart({
  part,
  live,
  showSteps,
  sources,
}: {
  readonly part: Extract<InlineTimelinePart, { readonly kind: 'tools' }>;
  readonly live: boolean;
  readonly showSteps: boolean;
  readonly sources: readonly NumberedSource[];
}): ReactNode {
  if (showSteps)
    return (
      <InlineTool tools={part.tools} activities={part.activities} sources={sources} live={live} />
    );
  return (
    <View>
      {part.activities.map((activity) =>
        activity.kind === 'reasoning' ? (
          <Thinking key={activity.key} text={activity.text} live={live} />
        ) : null,
      )}
    </View>
  );
}

function ReplyPart({
  part,
  live,
  tail,
  chatId,
  showSteps,
  accessibility,
  sources,
}: {
  readonly sources: readonly NumberedSource[];
  readonly part: InlineTimelinePart;
  readonly live: boolean;
  readonly tail: boolean;
  readonly chatId: string;
  readonly showSteps: boolean;
  readonly accessibility: MessageActions['accessibility'];
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const streaming = tail ? live : false;
  switch (part.kind) {
    case 'text':
      return (
        <View
          {...(live
            ? {}
            : { accessible: true, accessibilityLabel: readableText(part.text), ...accessibility })}
        >
          <StreamBlocks
            view={streaming ? streamView(part.text) : finalView(part.text)}
            caret={streaming}
            selectable={pointer}
          />
        </View>
      );
    case 'reasoning':
      return <Thinking text={part.text} live={streaming} />;
    case 'tools':
      return <ToolPart part={part} live={live} showSteps={showSteps} sources={sources} />;
    case 'image':
      return <InlineImage chatId={chatId} operationId={part.operationId} />;
  }
}
export function InlineReply({
  item,
  live,
  actions,
}: {
  readonly item: MessageItem;
  readonly live: boolean;
  readonly actions: MessageActions;
}): ReactNode {
  const timeline = replyTimeline(item.row);
  const showSteps = useAssistantStatus()?.settings.activity_steps !== false;
  const sources = live ? [] : webSourcesOf(item.row);
  if (timeline === null)
    return (
      <View className="gap-2">
        <Text tone="warning">
          This app cannot read the saved tool history. Update the app to view it.
        </Text>
        <WebSources sources={sources} />
      </View>
    );
  const parts = inlineTimeline(timeline.parts);
  const associated = timelineSources(showSteps ? parts : [], sources);
  return (
    <View className="w-full gap-2.5">
      {parts.map((part, index) => (
        <ReplyPart
          key={part.key}
          part={part}
          live={live}
          tail={index === parts.length - 1}
          chatId={item.row.chat_id}
          showSteps={showSteps}
          accessibility={actions.accessibility}
          sources={associated.groups.get(part.key) ?? []}
        />
      ))}
      <WebSources sources={associated.remaining} />
    </View>
  );
}
