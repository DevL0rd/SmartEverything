import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveAlbum } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { Cover } from '../places/cover';
import { useWhoSees } from '../sharing/album-who';
import { loadedItems, usePhotoAlbumItems } from './album-data';
import { mosaicOf, spanOf } from './album-items';
import { itemsText, ruleLine, type Visibility } from './model';

export type AlbumLook = 'card' | 'row';

function EmptyCover({
  album,
  className,
}: {
  readonly album: DriveAlbum;
  readonly className: string;
}): ReactNode {
  return (
    <View accessible={false} className={cn('items-center justify-center bg-surface-3', className)}>
      <Icon name={album.kind === 'smart' ? 'sparkles' : 'layers'} size={24} tone="faint" />
    </View>
  );
}

function CardMosaic({
  album,
  ids,
}: {
  readonly album: DriveAlbum;
  readonly ids: readonly string[];
}): ReactNode {
  if (album.itemCount === 0) return <EmptyCover album={album} className="h-30" />;
  return (
    <View className="h-30 flex-row gap-0.5">
      <Cover itemId={ids[0] ?? null} className="h-full flex-2 rounded-none" />
      <View className="flex-1 gap-0.5">
        <Cover itemId={ids[1] ?? null} className="flex-1 rounded-none" />
        <Cover itemId={ids[2] ?? null} className="flex-1 rounded-none" />
      </View>
    </View>
  );
}

function RowMosaic({
  album,
  ids,
}: {
  readonly album: DriveAlbum;
  readonly ids: readonly string[];
}): ReactNode {
  if (album.itemCount === 0) return <EmptyCover album={album} className="h-16 w-27.5 rounded-sm" />;
  return (
    <View className="flex-row gap-0.5">
      <Cover itemId={ids[0] ?? null} className="h-16 w-18 rounded-sm" />
      <Cover itemId={ids[1] ?? null} className="h-16 w-9 rounded-sm" />
    </View>
  );
}

function countLine(album: DriveAlbum, span: string | null): string {
  const items = itemsText(album.itemCount);
  return span === null ? items : `${items} · ${span}`;
}

function AlbumText({
  album,
  span,
  who,
}: {
  readonly album: DriveAlbum;
  readonly span: string | null;
  readonly who: Visibility;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="flex-row items-center gap-1.5">
        {album.kind === 'smart' ? <Icon name="sparkles" size={14} tone="primary" /> : null}
        <Text variant="label" numberOfLines={1} className="min-w-0 flex-1">
          {album.title}
        </Text>
      </View>
      {album.kind === 'smart' ? (
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
          {ruleLine(album.rule)}
        </Text>
      ) : null}
      <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
        {countLine(album, span)}
      </Text>
      <View className="flex-row items-center gap-1">
        <Icon name={who.icon} size={14} tone="variant" />
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {who.label}
        </Text>
      </View>
    </View>
  );
}

export function tileLabel(album: DriveAlbum, who: Visibility): string {
  const kind = album.kind === 'smart' ? 'Smart album' : 'Album';
  return `${kind} ${album.title}, ${itemsText(album.itemCount)}, ${who.label}`;
}

export function AlbumTile({
  album,
  look,
}: {
  readonly album: DriveAlbum;
  readonly look: AlbumLook;
}): ReactNode {
  const photoAlbumItems = usePhotoAlbumItems(album.id);
  const loaded = loadedItems(photoAlbumItems);
  const ids = mosaicOf(album.coverItemId, loaded?.items ?? []);
  const span = loaded?.complete === true ? spanOf(loaded.items) : null;
  const card = look === 'card';
  const who = useWhoSees(album);
  return (
    <Interactive
      href={href.photosAlbum(album.id)}
      label={tileLabel(album, who)}
      className={cn(
        'overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1',
        card ? 'gap-0' : 'flex-row items-center gap-3 p-3',
      )}
      layerClassName="rounded-lg"
    >
      {card ? <CardMosaic album={album} ids={ids} /> : <RowMosaic album={album} ids={ids} />}
      <View className={card ? 'px-3 py-2.5' : 'min-w-0 flex-1'}>
        <AlbumText album={album} span={span} who={who} />
      </View>
    </Interactive>
  );
}
