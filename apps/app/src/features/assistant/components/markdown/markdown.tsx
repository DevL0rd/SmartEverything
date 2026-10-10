import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Linking, Text as NativeText, ScrollView, View } from 'react-native';
import { CodeBlock } from '../../../../components/code';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { parseMarkdown, type Block, type Inline } from './parse';

type Variant = 'body' | 'title-3' | 'body-strong' | 'footnote';

function InlineRun({ part }: { readonly part: Inline }): ReactNode {
  switch (part.kind) {
    case 'strong':
      return <NativeText className="font-sans-semibold">{part.text}</NativeText>;
    case 'em':
      return <NativeText className="italic">{part.text}</NativeText>;
    case 'code':
      return (
        <NativeText className="rounded-xs bg-surface-3 font-mono text-footnote">{` ${part.text} `}</NativeText>
      );
    case 'link':
      return (
        <NativeText
          accessibilityRole="link"
          className="text-primary underline"
          onPress={() => {
            void Linking.openURL(part.url);
          }}
        >
          {part.text}
        </NativeText>
      );
    case 'text':
      return part.text;
  }
}

function Runs({
  inline,
  variant = 'body',
}: {
  readonly inline: readonly Inline[];
  readonly variant?: Variant;
}): ReactNode {
  return (
    <Text variant={variant} selectable>
      {inline.map((part, index) => (
        <InlineRun key={index} part={part} />
      ))}
    </Text>
  );
}

function ListBlock({ block }: { readonly block: Extract<Block, { kind: 'list' }> }): ReactNode {
  return (
    <View className="gap-0.5">
      {block.items.map((item, index) => (
        <View key={index} className="flex-row gap-2 pl-1">
          <Text tone="variant" className="min-w-4">
            {block.ordered ? `${String(index + 1)}.` : '•'}
          </Text>
          <View className="min-w-0 flex-1">
            <Runs inline={item} />
          </View>
        </View>
      ))}
    </View>
  );
}

function TableRow({
  cells,
  head,
}: {
  readonly cells: readonly (readonly Inline[])[];
  readonly head: boolean;
}): ReactNode {
  return (
    <View className={cn('flex-row', head ? 'bg-surface-2' : 'border-t border-outline-variant')}>
      {cells.map((cell, index) => (
        <View key={index} className="w-40 px-3 py-2">
          <Runs inline={cell} variant={head ? 'body-strong' : 'footnote'} />
        </View>
      ))}
    </View>
  );
}

function TableBlock({ block }: { readonly block: Extract<Block, { kind: 'table' }> }): ReactNode {
  return (
    <ScrollView horizontal className="rounded-md border-hairline border-outline-variant">
      <View>
        <TableRow cells={block.header} head />
        {block.rows.map((row, index) => (
          <TableRow key={index} cells={row} head={false} />
        ))}
      </View>
    </ScrollView>
  );
}

function BlockView({ block }: { readonly block: Block }): ReactNode {
  switch (block.kind) {
    case 'paragraph':
      return <Runs inline={block.inline} />;
    case 'heading':
      return <Runs inline={block.inline} variant={block.level === 3 ? 'body-strong' : 'title-3'} />;
    case 'quote':
      return (
        <View className="border-l-2 border-outline pl-3">
          <Runs inline={block.inline} />
        </View>
      );
    case 'list':
      return <ListBlock block={block} />;
    case 'code':
      return (
        <CodeBlock code={block.code} label={block.language === '' ? 'Code' : block.language} />
      );
    case 'table':
      return <TableBlock block={block} />;
  }
}

export function Markdown({ text }: { readonly text: string }): ReactNode {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <View className="gap-2.5">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </View>
  );
}
