import { useMemo, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { PerfProbe } from '../../../perf/probe-kit';
import { useLiveTurn } from '../data/chat-store';
import { STREAM_FLUSH_MS } from '../data/stream-flush';
import type { MessageItem } from '../data/thread';
import { batchesWithin, type Ledger } from '../model/stream-fade';
import { finalView, streamView, type StreamView } from '../model/stream-view';
import { ThinkingWait } from './inline-tool';
import type { MessageActions } from './message-actions';
import type { FadeSlice } from './markdown/inline-runs';
import { Markdown } from './markdown/markdown';
import { mentionRuleOf, type MentionRule } from './markdown/mention-runs';
import { parseMarkdown } from '@smarteverything/domain/markdown';
import { renderedLength } from './markdown/rendered-length';
import { messageLabel, useTimeZone } from './message-parts';
import { StreamCaret } from './stream-caret';
import { StreamGrow } from './stream-grow';
import { useArrivals, useFadeGate } from './use-stream-fade';

interface ReplyView {
  readonly text: string;
  readonly view: StreamView;
  readonly caret: boolean;
  readonly at: number | null;
}

function useReplyView(item: MessageItem, live: boolean): ReplyView {
  const { row } = item;
  const turn = useLiveTurn(row.chat_id, STREAM_FLUSH_MS, live);
  const fromTurn = live && turn.text.length >= row.text.length;
  const text = fromTurn ? turn.text : row.text;
  const view = fromTurn ? turn.view : live ? streamView(text) : finalView(text);
  return {
    text,
    view,
    caret: live && turn.working,
    at: fromTurn ? turn.at : null,
  };
}

interface BlockFade {
  readonly slices: readonly (FadeSlice | null)[];
  readonly total: number;
}

function lengthsOf(view: StreamView): readonly number[] {
  return [...view.settled, view.tail].map((text) => renderedLength(parseMarkdown(text)));
}

function slicesOf(lengths: readonly number[], ledger: Ledger): readonly (FadeSlice | null)[] {
  let start = 0;
  return lengths.map((length) => {
    const from = start;
    start += length;
    const batches = batchesWithin(ledger, from, start);
    return batches === null ? null : { start: from, batches };
  });
}

function useBlockFade(view: StreamView, at: number | null, fading: boolean): BlockFade {
  const lengths = useMemo(() => lengthsOf(view), [view]);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const ledger = useArrivals(total, at, fading);
  return { slices: slicesOf(lengths, ledger), total };
}

function PendingNote({
  pending,
  caret,
}: {
  readonly pending: NonNullable<StreamView['pending']>;
  readonly caret: boolean;
}): ReactNode {
  return (
    <Text variant="footnote" tone="variant">
      {pending === 'code' ? 'Writing code' : 'Building a table'}
      {caret ? <StreamCaret /> : null}
    </Text>
  );
}

export function StreamBlocks({
  view,
  caret,
  streaming,
  at,
  selectable,
  mentions = null,
}: {
  readonly view: StreamView;
  readonly caret: boolean;
  readonly streaming: boolean;
  readonly at: number | null;
  readonly selectable: boolean;
  readonly mentions?: MentionRule | null;
}): ReactNode {
  const ref = useRef<View>(null);
  const gate = useFadeGate(ref, streaming);
  const { slices } = useBlockFade(view, at, gate.moving);
  const tailFade = slices.at(-1) ?? null;
  return (
    <StreamGrow smooth={gate.moving}>
      <View ref={ref} onLayout={gate.onLayout} className="gap-2">
        {view.settled.map((block, index) => (
          <Markdown
            key={index}
            text={block}
            selectable={selectable}
            mentions={mentions}
            lead={index === 0}
            fade={slices[index] ?? null}
          />
        ))}
        {view.tail === '' ? null : (
          <Markdown
            text={view.tail}
            selectable={selectable}
            mentions={mentions}
            lead={view.settled.length === 0}
            fade={tailFade}
            endMark={caret && view.pending === null ? <StreamCaret /> : null}
          />
        )}
        {view.pending === null ? null : <PendingNote pending={view.pending} caret={caret} />}
      </View>
    </StreamGrow>
  );
}

export function StreamedText({
  item,
  actions,
  live,
}: {
  readonly item: MessageItem;
  readonly actions: MessageActions;
  readonly live: boolean;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const timeZone = useTimeZone();
  const { text, view, caret, at } = useReplyView(item, live);
  if (text === '') {
    return live ? <ThinkingWait startedAt={item.row.created_at} /> : null;
  }
  const reading = live
    ? {}
    : {
        accessible: true,
        accessibilityLabel: messageLabel(item, timeZone),
        ...actions.accessibility,
      };
  return (
    <PerfProbe id="stream">
      <View className="w-full gap-2">
        <View {...reading}>
          <StreamBlocks
            view={view}
            caret={caret}
            streaming={live}
            at={at}
            selectable={pointer}
            mentions={mentionRuleOf(item.mentions)}
          />
        </View>
      </View>
    </PerfProbe>
  );
}
