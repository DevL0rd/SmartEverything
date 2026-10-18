import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';
import { View } from 'react-native';
import { Text } from '../../../../components/text';
import { sameJson } from '../../../../store/same-json';
import { PerfProbe, timed } from '../../../../perf/probe-kit';
import { CodeCard } from './code-card';
import { Runs, type FadeSlice } from './inline-runs';
import { parseMarkdown, type Block } from './parse';
import { blockLength, inlineLength, startsFrom } from './rendered-length';
import { TableCard } from './table-card';
import { useProgressiveCount } from '../../../../design/progressive-count';

function ListBlock({
  block,
  selectable,
  endMark,
  fade,
}: {
  readonly block: Extract<Block, { kind: 'list' }>;
  readonly selectable: boolean;
  readonly endMark: ReactNode;
  readonly fade: FadeSlice | null;
}): ReactNode {
  const starts = startsFrom(block.items.map(inlineLength), fade?.start ?? 0);
  return (
    <View className="gap-1">
      {block.items.map((item, index) => {
        return (
          <View key={index} className="flex-row gap-2.5">
            <View className="min-w-5 items-end pt-0.5">
              {block.ordered ? (
                <Text variant="body" tone="variant" className="tabular">
                  {`${String(index + 1)}.`}
                </Text>
              ) : (
                <View className="mt-2.5 size-1.5 rounded-full bg-on-surface-faint" />
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Runs
                inline={item}
                selectable={selectable}
                endMark={index === block.items.length - 1 ? endMark : null}
                fade={fade === null ? null : { start: starts[index] ?? 0, batches: fade.batches }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function BlockViewBase({
  block,
  selectable,
  endMark,
  fade,
}: {
  readonly block: Block;
  readonly selectable: boolean;
  readonly endMark: ReactNode;
  readonly fade: FadeSlice | null;
}): ReactNode {
  switch (block.kind) {
    case 'paragraph':
      return <Runs inline={block.inline} selectable={selectable} endMark={endMark} fade={fade} />;
    case 'heading':
      return (
        <View className="pt-1.5">
          <Runs
            inline={block.inline}
            variant={block.level === 3 ? 'body-strong' : 'title-3'}
            selectable={selectable}
            endMark={endMark}
            fade={fade}
          />
        </View>
      );
    case 'quote':
      return (
        <View className="border-l-4 border-primary/40 py-0.5 pl-3.5">
          <Runs
            inline={block.inline}
            tone="variant"
            selectable={selectable}
            endMark={endMark}
            fade={fade}
          />
        </View>
      );
    case 'list':
      return <ListBlock block={block} selectable={selectable} endMark={endMark} fade={fade} />;
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
}: {
  readonly text: string;
  readonly selectable?: boolean;
  readonly endMark?: ReactNode;
  readonly fade?: FadeSlice | null;
}): ReactNode {
  const blocks = useMemo(() => timed('parse', () => parseMarkdown(text)), [text]);
  const mounted = useProgressiveCount(blocks.length);
  const starts = startsFrom(blocks.map(blockLength), fade?.start ?? 0);
  return (
    <PerfProbe id="md">
      <View className="gap-2.5">
        {blocks.slice(0, mounted).map((block, index) => {
          const slice = sliceFor(block, starts[index] ?? 0, fade);
          return (
            <BlockView
              key={index}
              block={block}
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
