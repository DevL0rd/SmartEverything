import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';
import { View } from 'react-native';
import { Text } from '../../../../components/text';
import { sameJson } from '../../../../store/same-json';
import { PerfProbe, timed } from '../../../../perf/probe-kit';
import { CodeCard } from './code-card';
import { Runs } from './inline-runs';
import { parseMarkdown, type Block } from './parse';
import { TableCard } from './table-card';

function ListBlock({
  block,
  selectable,
  endMark,
}: {
  readonly block: Extract<Block, { kind: 'list' }>;
  readonly selectable: boolean;
  readonly endMark: ReactNode;
}): ReactNode {
  return (
    <View className="gap-1">
      {block.items.map((item, index) => (
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
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function BlockViewBase({
  block,
  selectable,
  endMark,
}: {
  readonly block: Block;
  readonly selectable: boolean;
  readonly endMark: ReactNode;
}): ReactNode {
  switch (block.kind) {
    case 'paragraph':
      return <Runs inline={block.inline} selectable={selectable} endMark={endMark} />;
    case 'heading':
      return (
        <View className="pt-1.5">
          <Runs
            inline={block.inline}
            variant={block.level === 3 ? 'body-strong' : 'title-3'}
            selectable={selectable}
            endMark={endMark}
          />
        </View>
      );
    case 'quote':
      return (
        <View className="border-l-4 border-primary/40 py-0.5 pl-3.5">
          <Runs inline={block.inline} tone="variant" selectable={selectable} endMark={endMark} />
        </View>
      );
    case 'list':
      return <ListBlock block={block} selectable={selectable} endMark={endMark} />;
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
    sameJson(left.block, right.block),
);

function MarkdownBase({
  text,
  selectable = false,
  endMark = null,
}: {
  readonly text: string;
  readonly selectable?: boolean;
  readonly endMark?: ReactNode;
}): ReactNode {
  const blocks = useMemo(() => timed('parse', () => parseMarkdown(text)), [text]);
  return (
    <PerfProbe id="md">
      <View className="gap-2.5">
        {blocks.map((block, index) => (
          <BlockView
            key={index}
            block={block}
            selectable={selectable}
            endMark={index === blocks.length - 1 ? endMark : null}
          />
        ))}
      </View>
    </PerfProbe>
  );
}

export const Markdown = memo(MarkdownBase);
