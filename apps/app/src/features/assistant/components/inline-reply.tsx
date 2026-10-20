import { memo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { useChatMessages } from '../data/chat-store';
import { useOlderRows, mergedRows } from '../data/history';
import { useAssistantStatus } from '../data/assistant-data';
import { STREAM_FLUSH_MS, useFlushedAt } from '../data/stream-flush';
import { replyParts } from '../model/reply-timeline';
import { streamingKey, type InlineTimelinePart } from '../model/inline-timeline';
import { endsMessage, type MessageItem } from '../data/thread';
import { useImageOperations } from '../images/data/image-queries';
import { ImageOperationBubble } from '../images/components/image-receipts';
import { resultMessageId } from '../images/model/image-thread';
import type { MessageActions } from './message-actions';
import { readableBlocks } from './markdown/parse';
import { StreamBlocks } from './streamed-text';
import { StreamParser, finalView } from '../model/stream-view';
import { usePendingKeys } from '../../../components/deferred-action';
import { InlineTool } from './inline-tool';
import { Disclosure } from '../../../components/disclosure';
import { TypingDots } from './typing-dots';
import { inlineMessageItem, renderInlineImageMessage } from './inline-image-message';
import { InlineSteer } from './inline-steer';
import { WebSources } from './web-sources';
import { timelineSources, webSourcesOf, type NumberedSource } from '../model/web-sources';

function Thinking({ text, live }: { readonly text: string; readonly live: boolean }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <Disclosure
      label={live ? 'Thinking…' : 'Thinking'}
      trailing={live ? <TypingDots tone="primary" /> : undefined}
      open={open}
      onToggle={() => {
        setOpen(!open);
      }}
      hint={open ? 'Hide thinking' : 'Show thinking'}
      bodyClassName="pl-4"
    >
      <Text variant="footnote" tone="variant" selectable>
        {text}
      </Text>
    </Disclosure>
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
  const older = useOlderRows(chatId);
  const hidden = usePendingKeys();
  const receipt = operations.data?.find((entry) => entry.id === operationId);
  if (
    receipt === undefined ||
    receipt.message_deleted === true ||
    hidden.has(resultMessageId(receipt) ?? receipt.id)
  )
    return null;
  const saved = mergedRows(rows, older).find((row) => row.id === resultMessageId(receipt));
  return (
    <ImageOperationBubble
      item={{
        type: 'image-operation',
        key: `image-operation-${receipt.id}`,
        receipt,
        message: saved === undefined ? null : inlineMessageItem(saved),
      }}
      flash={false}
      renderMessage={renderInlineImageMessage}
    />
  );
}
function ToolPart({
  part,
  live,
  active,
  showSteps,
  sources,
}: {
  readonly part: Extract<InlineTimelinePart, { readonly kind: 'tools' }>;
  readonly live: boolean;
  readonly active: boolean;
  readonly showSteps: boolean;
  readonly sources: readonly NumberedSource[];
}): ReactNode {
  if (showSteps)
    return (
      <InlineTool
        tools={part.tools}
        activities={part.activities}
        sources={sources}
        live={live}
        active={active}
      />
    );
  return (
    <View>
      {part.activities.map((activity) =>
        activity.kind === 'reasoning' ? (
          <Thinking key={activity.key} text={activity.text} live={active} />
        ) : null,
      )}
    </View>
  );
}

function TextPart({
  text,
  live,
  streaming,
  at,
  selectable,
  accessibility,
}: {
  readonly text: string;
  readonly live: boolean;
  readonly streaming: boolean;
  readonly at: number | null;
  readonly selectable: boolean;
  readonly accessibility: MessageActions['accessibility'];
}): ReactNode {
  const [parser] = useState(() => new StreamParser());
  const view = streaming ? parser.view(text) : finalView(text);
  return (
    <View
      {...(live
        ? {}
        : { accessible: true, accessibilityLabel: readableBlocks(view), ...accessibility })}
    >
      <StreamBlocks
        view={view}
        caret={streaming}
        streaming={streaming}
        at={at}
        selectable={selectable}
      />
    </View>
  );
}

const NO_SOURCES: readonly NumberedSource[] = [];

const NO_PARTS: readonly InlineTimelinePart[] = [];

const NO_ACCESSIBILITY: MessageActions['accessibility'] = {
  accessibilityActions: [],
  onAccessibilityAction: () => undefined,
};

const ReplyPart = memo(function ReplyPart({
  part,
  live,
  streaming,
  at,
  chatId,
  showSteps,
  accessibility,
  sources,
}: {
  readonly sources: readonly NumberedSource[];
  readonly part: InlineTimelinePart;
  readonly live: boolean;
  readonly streaming: boolean;
  readonly at: number | null;
  readonly chatId: string;
  readonly showSteps: boolean;
  readonly accessibility: MessageActions['accessibility'];
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  switch (part.kind) {
    case 'text':
      return (
        <TextPart
          text={part.text}
          live={live}
          streaming={streaming}
          at={at}
          selectable={pointer}
          accessibility={accessibility}
        />
      );
    case 'reasoning':
      return <Thinking text={part.text} live={streaming} />;
    case 'tools':
      return (
        <ToolPart
          part={part}
          live={live}
          active={streaming}
          showSteps={showSteps}
          sources={sources}
        />
      );
    case 'image':
      return <InlineImage chatId={chatId} operationId={part.operationId} />;
    case 'steer':
      return <InlineSteer chatId={chatId} messageId={part.message_id} />;
  }
});

export function InlineReply({
  item,
  live,
  actions,
}: {
  readonly item: MessageItem;
  readonly live: boolean;
  readonly actions: MessageActions;
}): ReactNode {
  const { value: row, at } = useFlushedAt(item.row, STREAM_FLUSH_MS, live);
  const parts = replyParts(row);
  const showSteps = useAssistantStatus()?.settings.activity_steps !== false;
  const sources = live ? NO_SOURCES : webSourcesOf(row);
  if (parts === null)
    return (
      <View className="gap-2">
        <Text tone="warning">
          This app cannot read the saved tool history. Update the app to view it.
        </Text>
        <WebSources sources={sources} />
      </View>
    );
  const streamingTail = streamingKey(parts, live);
  const associated = timelineSources(showSteps ? parts : NO_PARTS, sources);
  const { segment } = item;
  const shown = segment === null ? parts : parts.slice(segment.from, segment.to);
  return (
    <View className="w-full gap-2.5">
      {shown.map((part) => (
        <ReplyPart
          key={part.key}
          part={part}
          live={live}
          streaming={part.key === streamingTail}
          at={part.key === streamingTail ? at : null}
          chatId={row.chat_id}
          showSteps={showSteps}
          accessibility={live ? NO_ACCESSIBILITY : actions.accessibility}
          sources={associated.groups.get(part.key) ?? NO_SOURCES}
        />
      ))}
      {endsMessage(item) ? <WebSources sources={associated.remaining} /> : null}
    </View>
  );
}
