import { memo, useMemo, useState, type ReactNode } from 'react';
import type { AssistantMessageRow, ImageOperationReceipt } from '@smarteverything/domain';
import { View } from 'react-native';
import { useIdiom } from '../../../design/platform';
import { useChatMessages } from '../data/chat-store';
import { useOlderRows, mergedRows } from '../data/history';
import { useAssistantStatus } from '../data/assistant-data';
import { STREAM_FLUSH_MS, useFlushedAt } from '../data/stream-flush';
import { visibleReplyParts } from '../model/reply-timeline';
import { streamingKey, type InlineTimelinePart } from '../model/inline-timeline';
import { endsMessage, type MessageItem } from '../data/thread';
import { useImageOperations } from '../images/data/image-queries';
import { ImageOperationBubble } from '../images/components/image-receipts';
import {
  pendingImageFrame,
  resultMessageId,
  showImageReceiptLoading,
} from '../images/model/image-thread';
import { ImagePlaceholder } from '../../../components/image-placeholder';
import { imageReceiptStatus } from '../images/model/image-receipt';
import { ActivityAnnouncement } from './activity-announcement';
import type { MessageActions } from './message-actions';
import { readableBlocks } from '@smarteverything/domain/markdown';
import { StreamBlocks } from './streamed-text';
import { StreamParser, finalView } from '../model/stream-view';
import { usePendingKeys } from '../../../components/deferred-action';
import { InlineTool, ThinkingActivity, ThinkingWait } from './inline-tool';
import { inlineMessageItem, renderInlineImageMessage } from './inline-image-message';
import { InlineSteer } from './inline-steer';
import { WebSources } from './web-sources';
import { timelineSources, webSourcesOf, type NumberedSource } from '../model/web-sources';

function InlineImage({
  chatId,
  part,
  live,
}: {
  readonly chatId: string;
  readonly part: Extract<InlineTimelinePart, { readonly kind: 'image' }>;
  readonly live: boolean;
}): ReactNode {
  const operations = useImageOperations(chatId);
  const hidden = usePendingKeys();
  const receipt = operations.data?.find((entry) => entry.id === part.operationId);
  if (receipt === undefined) {
    const loading = showImageReceiptLoading(
      false,
      operations.isPending,
      live && part.awaitingReceipt,
    );
    return loading && !hidden.has(part.operationId) ? (
      <InlineImageSlot chatId={chatId} receipt={null} live={live} />
    ) : null;
  }
  if (receipt.message_deleted === true || hidden.has(resultMessageId(receipt) ?? receipt.id))
    return null;
  return <InlineImageSlot chatId={chatId} receipt={receipt} live={live} />;
}

function InlineImageSlot({
  chatId,
  receipt,
  live,
}: {
  readonly chatId: string;
  readonly receipt: ImageOperationReceipt | null;
  readonly live: boolean;
}): ReactNode {
  const status = receipt === null ? 'Loading image' : imageReceiptStatus(receipt);
  const announceOnMount = receipt === null ? live : ['reserved', 'running'].includes(receipt.state);
  return (
    <>
      <ActivityAnnouncement status={status} text={status} announceOnMount={announceOnMount} />
      {receipt === null ? (
        <ImageReceiptLoading />
      ) : (
        <InlineImageReceipt chatId={chatId} receipt={receipt} />
      )}
    </>
  );
}

function InlineImageReceipt({
  chatId,
  receipt,
}: {
  readonly chatId: string;
  readonly receipt: ImageOperationReceipt;
}): ReactNode {
  const rows = useChatMessages(chatId);
  const older = useOlderRows(chatId);
  const saved = mergedRows(rows, older).find((row) => row.id === resultMessageId(receipt));
  return (
    <ImageOperationBubble
      item={{
        type: 'image-operation',
        key: `image-operation-${receipt.id}`,
        receipt,
        message: saved === undefined ? null : inlineMessageItem(saved),
        group: false,
      }}
      flash={false}
      announce={false}
      renderMessage={renderInlineImageMessage}
    />
  );
}

function ImageReceiptLoading(): ReactNode {
  return (
    <View
      style={pendingImageFrame(null)}
      accessibilityLabel="Loading image"
      accessibilityRole="image"
      className="max-w-full overflow-hidden rounded-xl border-hairline border-outline-variant"
    >
      <ImagePlaceholder />
    </View>
  );
}
interface ActivityContext {
  readonly messageId: string;
  readonly startedAt: string;
}

function ToolPart({
  part,
  live,
  active,
  stopped,
  showSteps,
  sources,
  context,
}: {
  readonly part: Extract<InlineTimelinePart, { readonly kind: 'tools' }>;
  readonly live: boolean;
  readonly active: boolean;
  readonly stopped: boolean;
  readonly showSteps: boolean;
  readonly sources: readonly NumberedSource[];
  readonly context: ActivityContext;
}): ReactNode {
  if (showSteps)
    return (
      <InlineTool
        tools={part.tools}
        activities={part.activities}
        sources={sources}
        live={live}
        active={active}
        stopped={stopped}
        openKey={`${context.messageId}:${part.key}`}
        startedAt={context.startedAt}
      />
    );
  return (
    <View className="gap-1">
      {part.activities.map((activity) =>
        activity.kind === 'reasoning' ? (
          <ThinkingActivity
            key={activity.key}
            text={activity.text}
            live={active}
            openKey={`${context.messageId}:${activity.key}`}
            startedAt={context.startedAt}
          />
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

interface ReplyPartProps {
  readonly context: ActivityContext;
  readonly sources: readonly NumberedSource[];
  readonly part: InlineTimelinePart;
  readonly live: boolean;
  readonly streaming: boolean;
  readonly at: number | null;
  readonly chatId: string;
  readonly showSteps: boolean;
  readonly stopped: boolean;
  readonly accessibility: MessageActions['accessibility'];
}

const ReplyPart = memo(function ReplyPart(props: ReplyPartProps): ReactNode {
  const { part, live, streaming, at, chatId, showSteps, stopped, accessibility, sources, context } =
    props;
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
      return (
        <ThinkingActivity
          text={part.text}
          live={streaming}
          openKey={`${context.messageId}:${part.key}`}
          startedAt={context.startedAt}
        />
      );
    case 'tools':
      return (
        <ToolPart
          part={part}
          live={live}
          active={streaming}
          stopped={stopped}
          showSteps={showSteps}
          sources={sources}
          context={context}
        />
      );
    case 'image':
      return <InlineImage chatId={chatId} part={part} live={live} />;
    case 'steer':
      return <InlineSteer chatId={chatId} messageId={part.message_id} />;
  }
});

function stoppedToolsKey(
  row: AssistantMessageRow,
  parts: readonly InlineTimelinePart[],
): string | null {
  if (row.state !== 'failed' || row.reason_code !== 'stopped') return null;
  return parts.findLast((part) => part.kind === 'tools')?.key ?? null;
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
  const { value: row, at } = useFlushedAt(item.row, STREAM_FLUSH_MS, live);
  const showSteps = useAssistantStatus()?.settings.activity_steps !== false;
  const parts = visibleReplyParts(row, showSteps);
  const sources = live ? NO_SOURCES : webSourcesOf(row);
  const context = useMemo(
    () => ({ messageId: row.id, startedAt: row.created_at }),
    [row.id, row.created_at],
  );
  if (parts === null) return null;
  const streamingTail = streamingKey(parts, live);
  const stoppedKey = stoppedToolsKey(row, parts);
  const associated = timelineSources(showSteps ? parts : NO_PARTS, sources);
  const { segment } = item;
  const shown = segment === null ? parts : parts.slice(segment.from, segment.to);
  if (live && parts.length === 0) return <ThinkingWait startedAt={row.created_at} />;
  return (
    <View className="w-full gap-2">
      {shown.map((part) => (
        <ReplyPart
          key={part.key}
          part={part}
          live={live}
          streaming={part.key === streamingTail}
          at={part.key === streamingTail ? at : null}
          chatId={row.chat_id}
          showSteps={showSteps}
          stopped={part.key === stoppedKey}
          accessibility={live ? NO_ACCESSIBILITY : actions.accessibility}
          sources={associated.groups.get(part.key) ?? NO_SOURCES}
          context={context}
        />
      ))}
      {endsMessage(item) ? <WebSources sources={associated.remaining} /> : null}
    </View>
  );
}
