import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { UseQueryResult } from '@tanstack/react-query';
import type { DriveItem } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { driveLinks, useDriveLink } from '../../nas/data';
import { openItemFile } from '../folder/folder-footer';
import {
  PREVIEW_HEAD_BYTES,
  columnNameOf,
  dimensionsOf,
  headIsWhole,
  headLinesOf,
  previewBodyOf,
  sheetDelimiterOf,
  sheetHeadOf,
  type PreviewBody,
} from './details-model';
import { background } from '@smarteverything/logging';

class DriveLinkMissingError extends Error {
  override readonly name = 'DriveLinkMissingError';
}

export async function fileLinkOf(item: DriveItem): Promise<string> {
  const url = await driveLinks.resolve(item.id, item.rev, 'file');
  if (url === null) throw new DriveLinkMissingError(`No link came back for ${item.name}.`);
  return url;
}

async function readHead(item: DriveItem): Promise<string> {
  const response = await fetch(await fileLinkOf(item), {
    headers: { range: `bytes=0-${String(PREVIEW_HEAD_BYTES - 1)}` },
  });
  if (!response.ok) {
    throw new Error(`Reading ${item.name} failed with status ${String(response.status)}`);
  }
  return response.text();
}

function useHead(item: DriveItem): UseQueryResult<readonly string[]> {
  const scope = { ...DRIVE_EVERYWHERE, rootId: item.rootId };
  return useScreenQuery({
    queryKey: driveKey('item', scope, item.id, 'head', item.rev),
    queryFn: () => readHead(item),
    select: (text: string) => headLinesOf(text, headIsWhole(item)),
  });
}

export function PreviewPicture({ item }: { readonly item: DriveItem }): ReactNode {
  const url = useDriveLink(item.id, item.rev, 'preview');
  const dimensions = dimensionsOf(item);
  return (
    <View className="aspect-4/3 w-full overflow-hidden rounded-md bg-surface-3">
      {url === null ? null : (
        <Image
          source={{ uri: url }}
          recyclingKey={`${item.id}:${String(item.rev)}`}
          contentFit="contain"
          accessibilityLabel={item.name}
          style={StyleSheet.absoluteFill}
        />
      )}
      {dimensions === null ? null : (
        <View className="absolute bottom-2.5 left-2.5">
          <Badge label={dimensions} />
        </View>
      )}
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

function TextHead({ lines }: { readonly lines: readonly string[] }): ReactNode {
  return (
    <View className="rounded-md border-hairline border-outline-variant bg-surface-2 p-3">
      <Text selectable className="font-mono text-footnote">
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

function HeadLines({
  item,
  body,
  lines,
}: {
  readonly item: DriveItem;
  readonly body: HeadBody;
  readonly lines: readonly string[];
}): ReactNode {
  const delimiter = sheetDelimiterOf(item);
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
        <TextHead lines={lines} />
      )}
      {headIsWhole(item) ? null : (
        <Text variant="footnote" tone="variant">
          {HEAD_NOTE[body]}
        </Text>
      )}
    </>
  );
}

function Head({ item, body }: { readonly item: DriveItem; readonly body: HeadBody }): ReactNode {
  const head = useHead(item);
  if (head.isError) {
    return (
      <ErrorState
        error={head.error}
        retry={() => {
          background(head.refetch(), 'drive.preview_head_failed');
        }}
      />
    );
  }
  if (head.data === undefined) return <Skeleton shape="tile" />;
  return <HeadLines item={item} body={body} lines={head.data} />;
}

function Body({ item, body }: { readonly item: DriveItem; readonly body: PreviewBody }): ReactNode {
  switch (body) {
    case 'picture':
      return <PreviewPicture item={item} />;
    case 'sheet':
    case 'text':
      return <Head item={item} body={body} />;
    case 'none':
      return (
        <EmptyState
          compact
          icon="fileText"
          title="No preview for this kind of file"
          body="Open it in its own app or download it to see what is inside."
        />
      );
  }
}

function LookButton({
  item,
  quickLook,
}: {
  readonly item: DriveItem;
  readonly quickLook: ((item: DriveItem) => void) | undefined;
}): ReactNode {
  return quickLook === undefined ? (
    <Button
      label="Open"
      icon="externalLink"
      variant="tonal"
      grow
      onPress={() => {
        openItemFile(item, false);
      }}
    />
  ) : (
    <Button
      label="Quick look"
      icon="eye"
      variant="tonal"
      grow
      onPress={() => {
        quickLook(item);
      }}
    />
  );
}

export function PreviewTab({
  item,
  quickLook,
}: {
  readonly item: DriveItem;
  readonly quickLook: ((item: DriveItem) => void) | undefined;
}): ReactNode {
  return (
    <View className="gap-3">
      <Body item={item} body={previewBodyOf(item)} />
      <View className="flex-row gap-2">
        <LookButton item={item} quickLook={quickLook} />
        <Button
          label="Download"
          icon="download"
          variant="outlined"
          grow
          onPress={() => {
            openItemFile(item, true);
          }}
        />
      </View>
    </View>
  );
}
