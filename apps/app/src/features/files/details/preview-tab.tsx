import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import {
  VIEW_ONLY_LINE,
  entryTextOf,
  exportStateOf,
  type ExportState,
} from '../quick-look/export-model';
import { downloadNode, nodeKeyOf, openNode } from '../quick-look/node-files';
import { useTextHead } from '../quick-look/text-head';
import type { FileLinks, FileNode } from '../source/types';
import { useSourceLinks } from '../source/source-hooks';
import {
  PREVIEW_HEAD_BYTES,
  columnNameOf,
  headLinesOf,
  previewBodyOf,
  sheetDelimiterOf,
  sheetHeadOf,
  type PreviewBody,
} from './details-model';
import type { DetailsProps } from './details-host';

export function PreviewPicture({
  node,
  thumb,
}: {
  readonly node: FileNode;
  readonly thumb: string;
}): ReactNode {
  return (
    <View className="aspect-4/3 w-full overflow-hidden rounded-md bg-surface-3">
      <Image
        source={{ uri: thumb }}
        recyclingKey={nodeKeyOf(node)}
        contentFit="contain"
        accessibilityLabel={node.name}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function Cell({
  text,
  edge = false,
  number = false,
}: {
  readonly text: string;
  readonly edge?: boolean;
  readonly number?: boolean;
}): ReactNode {
  return (
    <View
      className={cn(
        'h-7 justify-center border-b border-r border-outline-variant px-2',
        number ? 'w-9 items-end' : 'w-24',
        edge ? 'bg-surface-3' : '',
      )}
    >
      <Text
        variant="caption"
        tone={edge ? 'variant' : 'default'}
        numberOfLines={1}
        className="tabular"
      >
        {text}
      </Text>
    </View>
  );
}

function SheetGrid({
  lines,
  delimiter,
}: {
  readonly lines: readonly string[];
  readonly delimiter: string;
}): ReactNode {
  const sheet = sheetHeadOf(lines, delimiter);
  const columns = Array.from({ length: sheet.columns }, (_unused, index) => index);
  return (
    <ScrollView
      horizontal
      className="grow-0 rounded-md border-l border-t border-outline-variant bg-surface-2"
    >
      <View>
        <View className="flex-row">
          <Cell text="" edge number />
          {columns.map((column) => (
            <Cell key={column} text={columnNameOf(column)} edge />
          ))}
        </View>
        {sheet.rows.map((row, index) => (
          <View key={index} className="flex-row">
            <Cell text={String(index + 1)} edge number />
            {columns.map((column) => (
              <Cell key={column} text={row[column] ?? ''} />
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function TextHead({
  lines,
  selectable,
}: {
  readonly lines: readonly string[];
  readonly selectable: boolean;
}): ReactNode {
  return (
    <View className="rounded-md border-hairline border-outline-variant bg-surface-2 p-3">
      <Text selectable={selectable} className="font-mono text-footnote">
        {lines.join('\n')}
      </Text>
    </View>
  );
}

type HeadBody = Extract<PreviewBody, 'sheet' | 'text'>;

export const HEAD_NOTE: Readonly<Record<HeadBody, string>> = {
  sheet: 'Sheets show the first rows. Open it in its own app for the rest.',
  text: 'Text shows the first lines. Open it in its own app for the rest.',
};

interface HeadProps {
  readonly node: FileNode;
  readonly links: FileLinks;
  readonly body: HeadBody;
  readonly exports: ExportState;
}

function Head({ node, links, body, exports }: HeadProps): ReactNode {
  const head = useTextHead(links.file, node.size ?? 0, nodeKeyOf(node), PREVIEW_HEAD_BYTES);
  if (head.state === 'loading') return <Skeleton shape="tile" />;
  if (head.state === 'failed') {
    return (
      <EmptyState
        compact
        icon="fileText"
        title="The start of this file could not be read"
        body="Open it in its own app to see what is inside."
      />
    );
  }
  const lines = headLinesOf(head.head.text, !head.head.partial);
  const delimiter = sheetDelimiterOf(node);
  if (lines.length === 0) {
    return (
      <EmptyState compact icon="fileText" title="This file is empty" body="Nothing is in it yet." />
    );
  }
  return (
    <>
      {body === 'sheet' && delimiter !== null ? (
        <SheetGrid lines={lines} delimiter={delimiter} />
      ) : (
        <TextHead lines={lines} selectable={exports.selectable} />
      )}
      {head.head.partial ? (
        <Text variant="footnote" tone="variant">
          {HEAD_NOTE[body]}
        </Text>
      ) : null}
    </>
  );
}

function noPreviewLineOf(exports: ExportState): string {
  if (exports.entry !== null) return entryTextOf(exports.entry);
  if (exports.viewOnly) return VIEW_ONLY_LINE;
  return 'Open it in its own app or download it to see what is inside.';
}

function Body({
  body,
  ...props
}: Omit<HeadProps, 'body'> & { readonly body: PreviewBody }): ReactNode {
  const { node, links, exports } = props;
  switch (body) {
    case 'picture':
      return links.thumb === null ? null : <PreviewPicture node={node} thumb={links.thumb} />;
    case 'sheet':
    case 'text':
      return <Head body={body} {...props} />;
    case 'none':
      return (
        <EmptyState
          compact
          icon="fileText"
          title="No preview for this kind of file"
          body={noPreviewLineOf(exports)}
        />
      );
  }
}

export function PreviewTab<O>({ node, host }: DetailsProps<O>): ReactNode {
  const links = useSourceLinks(host.source, node);
  const exports = exportStateOf(node, host.abilities);
  const { quickLook } = host;
  return (
    <View className="gap-3">
      <Body node={node} links={links} exports={exports} body={previewBodyOf(node, links.thumb)} />
      <View className="flex-row gap-2">
        {quickLook === null ? null : (
          <Button
            label="Quick look"
            icon="eye"
            variant="tonal"
            grow
            onPress={() => {
              quickLook(node);
            }}
          />
        )}
        {quickLook !== null || !exports.mayOpen ? null : (
          <Button
            label="Open"
            icon="externalLink"
            variant="tonal"
            grow
            disabled={links.file === null}
            onPress={() => {
              openNode(node, links);
            }}
          />
        )}
        {exports.mayDownload ? (
          <Button
            label="Download"
            icon="download"
            variant="outlined"
            grow
            disabled={links.download === null}
            onPress={() => {
              downloadNode(node, links);
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
