import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import type { DriveItem } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { Zoomable } from '../../../components/zoomable';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { useDriveLink } from '../../nas/data';
import { openItemFile } from '../folder/folder-footer';
import { itemsText } from '../folder/folder-model';
import { MediaPlayer } from './media-player';
import { contentOf, showsImageFile } from './quick-look-model';
import { useTextHead, type TextHead } from './text-head';

const log = new Logger('app.drive');

function open(item: DriveItem): void {
  openItemFile(item, false);
}

function hasPreview(item: DriveItem): boolean {
  return item.kind !== 'folder' && item.thumb.state === 'ready';
}

function wantsOriginal(item: DriveItem, zoomed: boolean): boolean {
  if (item.kind !== 'image') return false;
  return showsImageFile(item.mime) && (zoomed || item.thumb.state !== 'ready');
}

function Picture({ item }: { readonly item: DriveItem }): ReactNode {
  const [zoomed, setZoomed] = useState(false);
  const preview = useDriveLink(hasPreview(item) ? item.id : null, item.rev, 'preview');
  const original = useDriveLink(wantsOriginal(item, zoomed) ? item.id : null, item.rev, 'file');
  const uri = original ?? preview;
  return (
    <Zoomable className="size-full overflow-hidden" onZoomed={setZoomed}>
      <Image
        source={uri === null ? null : { uri }}
        placeholder={original === null || preview === null ? null : { uri: preview }}
        placeholderContentFit="contain"
        contentFit="contain"
        cachePolicy="disk"
        recyclingKey={`${item.id}:${String(item.rev)}`}
        onError={(event) => {
          log.warn('quick_look.image_failed', { reason: event.error });
        }}
        style={StyleSheet.absoluteFill}
        accessibilityLabel={item.name}
      />
    </Zoomable>
  );
}

function Media({
  item,
  kind,
}: {
  readonly item: DriveItem;
  readonly kind: 'video' | 'audio';
}): ReactNode {
  const url = useDriveLink(item.id, item.rev, 'file');
  const poster = useDriveLink(hasPreview(item) ? item.id : null, item.rev, 'preview');
  if (url === null) return <Skeleton shape="block" className="size-full" />;
  return (
    <MediaPlayer
      kind={kind}
      url={url}
      poster={poster}
      label={item.name}
      onOpen={() => {
        open(item);
      }}
    />
  );
}

function headNote(head: TextHead, total: number): string | null {
  if (!head.partial) return null;
  return `Showing the first ${bytes(head.shownBytes)} of ${bytes(total)}. Open the file to read the rest.`;
}

function Lines({ head, total }: { readonly head: TextHead; readonly total: number }): ReactNode {
  const lines = useMemo(() => head.text.split('\n'), [head.text]);
  const note = headNote(head, total);
  return (
    <View className="size-full min-h-0 gap-2 p-4">
      <View className="min-h-0 flex-1 rounded-md border-hairline border-outline-variant bg-surface-1">
        <FlashList
          data={lines}
          keyExtractor={(_line, index) => String(index)}
          ListHeaderComponent={<View className="h-3" />}
          ListFooterComponent={<View className="h-3" />}
          renderItem={({ item }) => (
            <Text selectable className="px-4 font-mono text-footnote">
              {item === '' ? ' ' : item}
            </Text>
          )}
        />
      </View>
      {note === null ? null : (
        <Text variant="footnote" tone="variant" className="tabular">
          {note}
        </Text>
      )}
    </View>
  );
}

function Unshown({ item, body }: { readonly item: DriveItem; readonly body: string }): ReactNode {
  return (
    <EmptyState
      icon="fileText"
      title={item.name}
      body={body}
      action={
        <Button
          label="Open"
          icon="externalLink"
          variant="tonal"
          onPress={() => {
            open(item);
          }}
        />
      }
    />
  );
}

function TextBody({ item }: { readonly item: DriveItem }): ReactNode {
  const head = useTextHead(item);
  if (head.state === 'loading') return <Skeleton shape="block" className="size-full" />;
  if (head.state === 'failed') {
    return (
      <Unshown item={item} body="The start of this file could not be read. Open it instead." />
    );
  }
  return <Lines head={head.head} total={item.kind === 'folder' ? 0 : item.bytes} />;
}

function FolderBody({ item }: { readonly item: DriveItem }): ReactNode {
  const body =
    item.kind === 'folder' ? joinParts([itemsText(item.childCount), bytes(item.bytes)]) : '';
  return <EmptyState icon="folder" title={item.name} body={body} />;
}

export function QuickLookContent({ item }: { readonly item: DriveItem }): ReactNode {
  const content = contentOf(item);
  switch (content) {
    case 'folder':
      return <FolderBody item={item} />;
    case 'image':
    case 'picture':
      return <Picture item={item} />;
    case 'video':
    case 'audio':
      return <Media item={item} kind={content} />;
    case 'text':
      return <TextBody item={item} />;
    case 'none':
      return (
        <Unshown
          item={item}
          body="There is no quick look for this kind of file. Open it or download it."
        />
      );
  }
}
