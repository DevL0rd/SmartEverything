import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';
import { View } from 'react-native';
import { Text } from '../../../../components/text';
import { sameJson } from '../../../../store/same-json';
import { PerfProbe, timed } from '../../../../perf/probe-kit';
import { CodeCard } from './code-card';
import { Runs, type FadeSlice } from './inline-runs';
import type { MentionRule } from './mention-runs';
import { parseMarkdown, type Block } from '@smarteverything/domain/markdown';
import { blockLength, inlineLength, startsFrom } from './rendered-length';
import { TableCard } from './table-card';
import { useProgressiveCount } from '../../../../design/progressive-count';

interface BlockLook {
  readonly selectable: boolean;
  readonly endMark: ReactNode;
  readonly fade: FadeSlice | null;
  readonly mentions: MentionRule | null;
}

function Marker({
  ordered,
  index,
}: {
  readonly ordered: boolean;
  readonly index: number;
}): ReactNode {
  if (ordered) {
    return (
      <View className="min-w-4.5">
        <Text variant="callout" tone="faint" className="tabular leading-5.5">
          {String(index + 1)}
        </Text>
      </View>
    );
  }
  return (
    <View className="w-3.5 pl-0.5 pt-2.25">
      <View className="size-1 rounded-full bg-on-surface-variant/70" />
    </View>
  );
}

function ListBlock({
  block,
  look,
}: {
  readonly block: Extract<Block, { kind: 'list' }>;
  readonly look: BlockLook;
}): ReactNode {
  const { fade } = look;
  const starts = startsFrom(block.items.map(inlineLength), fade?.start ?? 0);
  return (
    <View className="gap-1">
      {block.items.map((item, index) => (
        <View key={index} className="flex-row">
          <Marker ordered={block.ordered} index={index} />
          <View className="min-w-0 shrink">
            <Runs
              inline={item}
              selectable={look.selectable}
              mentions={look.mentions}
              endMark={index === block.items.length - 1 ? look.endMark : null}
              fade={fade === null ? null : { start: starts[index] ?? 0, batches: fade.batches }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function BlockViewBase({
  block,
  lead,
  ...look
}: BlockLook & { readonly block: Block; readonly lead: boolean }): ReactNode {
  const runs = {
    selectable: look.selectable,
    endMark: look.endMark,
    fade: look.fade,
    mentions: look.mentions,
  };
  switch (block.kind) {
    case 'paragraph':
      return <Runs inline={block.inline} {...runs} />;
    case 'heading':
      return (
        <View {...(lead ? {} : { className: 'pt-1' })}>
          <Runs inline={block.inline} variant="title-3" {...runs} />
        </View>
      );
    case 'quote':
      return (
        <View className="border-l-4 border-primary/40 py-0.5 pl-3.5">
          <Runs inline={block.inline} tone="variant" {...runs} />
        </View>
      );
    case 'list':
      return <ListBlock block={block} look={look} />;
    case 'code':
      return <CodeCard code={block.code} label={block.language === '' ? 'Code' : block.language} />;
    case 'table':
      return <TableCard table={block} />;
  }
}

const BlockView = memo(
  BlockViewBase,
  (left, right) =>
    left.selectable === right.selectable &&
    left.lead === right.lead &&
    left.mentions === right.mentions &&
    left.endMark === right.endMark &&
    left.fade === right.fade &&
    sameJson(left.block, right.block),
);

function sliceFor(block: Block, start: number, fade: FadeSlice | null): FadeSlice | null {
  if (fade === null) return null;
  const end = start + blockLength(block);
  return fade.batches.some((batch) => batch.from < end && batch.to > start)
    ? { start, batches: fade.batches }
    : null;
}

function MarkdownBase({
  text,
  selectable = false,
  endMark = null,
  fade = null,
  mentions = null,
  lead = true,
}: {
  readonly text: string;
  readonly selectable?: boolean;
  readonly endMark?: ReactNode;
  readonly fade?: FadeSlice | null;
  readonly mentions?: MentionRule | null;
  readonly lead?: boolean;
}): ReactNode {
  const blocks = useMemo(() => timed('parse', () => parseMarkdown(text)), [text]);
  const mounted = useProgressiveCount(blocks.length);
  const starts = startsFrom(blocks.map(blockLength), fade?.start ?? 0);
  return (
    <PerfProbe id="md">
      <View className="gap-2">
        {blocks.slice(0, mounted).map((block, index) => {
          const slice = sliceFor(block, starts[index] ?? 0, fade);
          return (
            <BlockView
              key={index}
              block={block}
              lead={index === 0 ? lead : false}
              mentions={mentions}
              selectable={selectable}
              endMark={index === blocks.length - 1 ? endMark : null}
              fade={slice}
            />
          );
        })}
      </View>
    </PerfProbe>
  );
}

export const Markdown = memo(MarkdownBase);
