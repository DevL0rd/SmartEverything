import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { MediaInfo } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Icon } from '../../../components/icon';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { Text } from '../../../components/text';
import { Zoomable } from '../../../components/zoomable';
import { useScopeVisible } from '../../../design/visibility';
import { driveLinks, useDriveLink } from '../../drive';
import { noPreviewOf, showsOriginal, type MediaItem } from './info-model';
import { SaveToDeviceButton } from './save-button';

const log = new Logger('app.photos');

export type PhotoLook = 'image' | 'processing' | 'no-preview';

export function photoLookOf(media: MediaInfo | null): PhotoLook {
  if (media === null) return 'image';
  const { state } = media.preview;
  if (state === 'failed' || state === 'unsupported') return 'no-preview';
  return state === 'ready' ? 'image' : 'processing';
}

function NoPreview({ item }: { readonly item: MediaItem }): ReactNode {
  const note = noPreviewOf(item);
  return (
    <View className="flex-1 items-center justify-center gap-3 p-6">
      <Icon name={note.icon} size={40} tone="variant" />
      <Text variant="title-3" align="center">
        {item.name}
      </Text>
      <Text variant="callout" tone="variant" align="center" className="max-w-reading">
        {note.text}
      </Text>
      <SaveToDeviceButton itemId={item.id} variant="outlined" />
    </View>
  );
}

function Picture({
  item,
  look,
  zoomed,
}: {
  readonly item: MediaItem;
  readonly look: PhotoLook;
  readonly zoomed: boolean;
}): ReactNode {
  const preview = useDriveLink(item.id, item.rev, look === 'image' ? 'preview' : 'thumb');
  const original = useDriveLink(
    (zoomed || look === 'processing') && showsOriginal(item) ? item.id : null,
    item.rev,
    'file',
  );
  const uri = original ?? preview;
  return (
    <Image
      source={uri === null ? null : { uri }}
      placeholder={original === null || preview === null ? null : { uri: preview }}
      placeholderContentFit="contain"
      contentFit="contain"
      cachePolicy="disk"
      onError={(event) => {
        log.warn('viewer.image_failed', { reason: event.error });
      }}
      style={StyleSheet.absoluteFill}
      accessibilityLabel={item.name}
    />
  );
}

function Processing(): ReactNode {
  return (
    <View pointerEvents="none" className="absolute inset-x-0 bottom-4 items-center">
      <View className="rounded-full bg-scrim px-3 py-1">
        <Text variant="caption">Making a preview</Text>
      </View>
    </View>
  );
}

export function ViewerPhoto({
  item,
  media,
  onZoomed,
}: {
  readonly item: MediaItem;
  readonly media: MediaInfo | null;
  readonly onZoomed: (zoomed: boolean) => void;
}): ReactNode {
  const [zoomed, setZoomed] = useState(false);
  const look = photoLookOf(media);
  if (look === 'no-preview') return <NoPreview item={item} />;
  return (
    <Zoomable
      wheel="wheel"
      className="size-full overflow-hidden"
      onZoomed={(value) => {
        setZoomed(value);
        onZoomed(value);
      }}
    >
      <Picture item={item} look={look} zoomed={zoomed} />
      {look === 'processing' ? <Processing /> : null}
    </Zoomable>
  );
}

function prefetch(tile: MediaTile): void {
  driveLinks
    .resolve(tile.id, tile.rev, 'preview')
    .then((url) => (url === null ? false : Image.prefetch(url, 'disk')))
    .catch((error: unknown) => {
      log.warn('viewer.prefetch_failed', { reason: String(error) });
    });
}

export function usePrefetchNeighbours(previous: MediaTile | null, next: MediaTile | null): void {
  const visible = useScopeVisible();
  const before = visible ? previous : null;
  const after = visible ? next : null;
  useEffect(() => {
    if (before !== null) prefetch(before);
  }, [before]);
  useEffect(() => {
    if (after !== null) prefetch(after);
  }, [after]);
}
