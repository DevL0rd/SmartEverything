import { useEffect, useState, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import type { Memory } from '@smarteverything/domain';
import { background, Logger } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Icon, type IconName } from '../../../components/icon';
import { MediaTileView, type ResolveThumb } from '../../../components/media-grid/tile';
import { tilesOfPage } from '../../../components/media-grid/tiles';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useAreaWidth } from '../../../design/size-class';
import { errorText } from '../../../format/errors';
import { count } from '../../../format/number';
import { useSyncStatus } from '../../../store/selectors';
import { driveLinks } from '../../nas/data/links';
import { flattenPages } from '../../nas/data/pages';
import { useDriveItem } from '../../nas/data/queries';
import { libraryLayoutOf } from '../../nas/frame/sections';
import { usePhotoAlbum, usePhotoAlbumItems, loadedItems } from '../../photos/albums/album-data';
import {
  PHOTO_ALL,
  usePhotoBuckets,
  usePhotoMemories,
  usePhotoMemoryItems,
  usePhotoMonth,
} from '../../photos/data';
import { MemoryPlayer } from '../../photos/memories';
import { coverFirst, isMedia } from '../../photos/memories/items';
import { memoryTitle } from '../../photos/memories/model';
import { longDay, monthName } from '../../photos/memories/text';
import { isMediaItem, tileOfItem, tilesOfItems } from '../../photos/search/results';
import { CHAT_SURFACE } from '../components/chat-surface';
import {
  PHOTOS_WIDGET_COPY,
  SINGLE_HEIGHT,
  stripLayout,
  validPhotosWidget,
  type PhotosChatWidget,
  type ReadyStrip,
  type Strip,
} from './photos-widget-model';

const log = new Logger('app.chat-widgets');

interface Refetchable {
  readonly error: Error | null;
  readonly refetch: () => Promise<unknown>;
}

function pending(query: Refetchable, view: PhotosChatWidget['view']): Strip {
  return query.error === null
    ? { status: 'loading' }
    : {
        status: 'error',
        error: query.error,
        retry: (): void => {
          background(query.refetch(), 'chat_widgets.photos_retry_failed', { view });
        },
      };
}

function useItemStrip(id: string): Strip {
  const item = useDriveItem(id, null);
  if (item.data === undefined) return pending(item, 'item');
  if (!isMediaItem(item.data)) return { status: 'missing', reason: PHOTOS_WIDGET_COPY.notMedia };
  return {
    status: 'ready',
    icon: item.data.kind === 'video' ? 'play' : 'image',
    title: item.data.kind === 'video' ? PHOTOS_WIDGET_COPY.video : PHOTOS_WIDGET_COPY.photo,
    trail: longDay((item.data.takenAt ?? item.data.modifiedAt).slice(0, 10)),
    tiles: [tileOfItem(item.data)],
    total: 1,
    action: { kind: 'link', label: PHOTOS_WIDGET_COPY.openPhotos, href: href.photosItem(id) },
    opens: {},
  };
}

function useAlbumStrip(id: string): Strip {
  const album = usePhotoAlbum(id);
  const pages = usePhotoAlbumItems(id);
  if (album === null) return { status: 'missing', reason: PHOTOS_WIDGET_COPY.gone };
  const loaded = loadedItems(pages);
  if (loaded === null) return pending(pages, 'album');
  return {
    status: 'ready',
    icon: album.kind === 'smart' ? 'sparkles' : 'layers',
    title: album.title,
    trail: count(album.itemCount),
    tiles: tilesOfItems(loaded.items),
    total: album.itemCount,
    action: { kind: 'link', label: PHOTOS_WIDGET_COPY.openAlbum, href: href.photosAlbum(id) },
    opens: { album: id },
  };
}

function useMemoryStrip(id: string): Strip {
  const memories = usePhotoMemories();
  const pages = usePhotoMemoryItems(id);
  if (memories.data === undefined) return pending(memories, 'memory');
  const memory = memories.data.find((entry) => entry.id === id);
  if (memory === undefined) return { status: 'missing', reason: PHOTOS_WIDGET_COPY.gone };
  if (pages.data === undefined) return pending(pages, 'memory');
  const items = flattenPages(pages.data, (page) => page.items).filter(isMedia);
  return {
    status: 'ready',
    icon: 'sparkles',
    title: memoryTitle(memory),
    trail: count(memory.count),
    tiles: tilesOfItems(coverFirst(items, memory.coverItemId)),
    total: memory.count,
    action: { kind: 'play', label: PHOTOS_WIDGET_COPY.play, memory },
    opens: {},
  };
}

function useMonthStrip(month: string): Strip {
  const buckets = usePhotoBuckets(PHOTO_ALL);
  const pages = usePhotoMonth(month, PHOTO_ALL, true);
  if (buckets.data === undefined) return pending(buckets, 'month');
  const bucket = buckets.data.find((entry) => entry.month === month);
  if (bucket === undefined) return { status: 'missing', reason: PHOTOS_WIDGET_COPY.noMonth };
  if (pages.data === undefined) return pending(pages, 'month');
  return {
    status: 'ready',
    icon: 'calendar',
    title: `${monthName(month)} ${month.slice(0, 4)}`,
    trail: count(bucket.count),
    tiles: flattenPages(pages.data, tilesOfPage),
    total: bucket.count,
    action: { kind: 'link', label: PHOTOS_WIDGET_COPY.openPhotos, href: href.photos() },
    opens: {},
  };
}

const resolveThumb: ResolveThumb = (tile) => driveLinks.resolve(tile.id, tile.rev, 'thumb');

function Note({
  icon,
  tone,
  text,
  detail,
  retry,
}: {
  readonly icon: IconName;
  readonly tone: 'warning' | 'critical';
  readonly text: string;
  readonly detail: string;
  readonly retry: (() => void) | null;
}): ReactNode {
  return (
    <View className="min-h-5 w-full max-w-130 flex-row items-center gap-1.5">
      <Icon name={icon} size={16} tone={tone} />
      <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
        {text}
        <Text variant="footnote" tone="faint">{` · ${detail}`}</Text>
      </Text>
      {retry === null ? null : (
        <Button label={PHOTOS_WIDGET_COPY.retry} variant="text" onPress={retry} />
      )}
    </View>
  );
}

function Pending(): ReactNode {
  const offline = useSyncStatus().status === 'interrupted';
  return offline ? (
    <Note
      icon="wifiOff"
      tone="warning"
      text={PHOTOS_WIDGET_COPY.offline}
      detail={PHOTOS_WIDGET_COPY.waiting}
      retry={null}
    />
  ) : (
    <View className={cn('w-full max-w-130 gap-2 p-2.5', CHAT_SURFACE)} aria-busy>
      <Skeleton className="w-1/2" />
      <Skeleton shape="block" className="h-17.5 w-full rounded-sm" />
    </View>
  );
}

function boxOf(width: number, height: number): ViewStyle {
  return { width, height };
}

function Thumbs({ strip }: { readonly strip: ReadyStrip }): ReactNode {
  const [width, setWidth] = useState(0);
  const layout = stripLayout(width, strip.tiles, strip.total);
  return (
    <View
      className={cn(
        'w-full flex-row gap-0.75',
        layout.height === SINGLE_HEIGHT ? 'h-50' : 'h-17.5',
      )}
      onLayout={(event) => {
        setWidth(Math.floor(event.nativeEvent.layout.width));
      }}
    >
      {layout.cells.map((cell) => (
        <View key={cell.tile.id} className="overflow-hidden rounded-sm">
          <MediaTileView
            tile={cell.tile}
            width={cell.width}
            height={layout.height}
            resolveThumb={resolveThumb}
            onOpen={(opened) => {
              router.push(href.photosItem(opened.id, strip.opens));
            }}
          />
        </View>
      ))}
      {layout.rest > 0 ? (
        <View
          aria-hidden
          className="items-center justify-center rounded-sm bg-surface-2"
          style={boxOf(layout.restWidth, layout.height)}
        >
          <Text variant="caption" tone="variant" className="tabular-nums">
            {`+${count(layout.rest)}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

interface CardProps {
  readonly strip: ReadyStrip;
  readonly onPlay: (memory: Memory) => void;
}

function ActionButton({ strip, onPlay }: CardProps): ReactNode {
  const { action } = strip;
  return action.kind === 'link' ? (
    <Button label={action.label} variant="tonal" href={action.href} />
  ) : (
    <Button
      label={action.label}
      icon="play"
      variant="tonal"
      onPress={() => {
        onPlay(action.memory);
      }}
    />
  );
}

function StripCard({ strip, onPlay }: CardProps): ReactNode {
  const offline = useSyncStatus().status === 'interrupted';
  return (
    <View className={cn('w-full max-w-130 gap-2 p-2.5', CHAT_SURFACE)}>
      <View className="flex-row items-center gap-2">
        <Icon name={strip.icon} size={20} tone="primary" />
        <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
          {strip.title}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
          {strip.trail}
        </Text>
      </View>
      {strip.tiles.length === 0 ? null : <Thumbs strip={strip} />}
      <View className="flex-row flex-wrap items-center gap-2">
        <ActionButton strip={strip} onPlay={onPlay} />
        {offline ? (
          <Text variant="caption" tone="warning" numberOfLines={1}>
            {PHOTOS_WIDGET_COPY.offline}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

type Problem = Extract<Strip, { readonly status: 'missing' | 'error' }>;

function ProblemNote({
  view,
  strip,
}: {
  readonly view: PhotosChatWidget['view'];
  readonly strip: Problem;
}): ReactNode {
  const failed = strip.status === 'error';
  const reason = failed ? null : strip.reason;
  const error = failed ? strip.error : null;
  useEffect(() => {
    if (reason !== null) log.warn('chat_widgets.photos_unavailable', { view, reason });
    if (error !== null) log.error('chat_widgets.photos_failed', error, { view });
  }, [view, reason, error]);
  return (
    <Note
      icon="alert"
      tone={failed ? 'critical' : 'warning'}
      text={PHOTOS_WIDGET_COPY.failed}
      detail={failed ? errorText(strip.error).title : strip.reason}
      retry={failed ? strip.retry : null}
    />
  );
}

function StripView({
  view,
  strip,
  onPlay,
}: {
  readonly view: PhotosChatWidget['view'];
  readonly strip: Strip;
  readonly onPlay: (memory: Memory) => void;
}): ReactNode {
  if (strip.status === 'ready') return <StripCard strip={strip} onPlay={onPlay} />;
  return strip.status === 'loading' ? <Pending /> : <ProblemNote view={view} strip={strip} />;
}

interface SourceProps {
  readonly id: string;
  readonly onPlay: (memory: Memory) => void;
}

function ItemSource({ id, onPlay }: SourceProps): ReactNode {
  return <StripView view="item" strip={useItemStrip(id)} onPlay={onPlay} />;
}

function AlbumSource({ id, onPlay }: SourceProps): ReactNode {
  return <StripView view="album" strip={useAlbumStrip(id)} onPlay={onPlay} />;
}

function MemorySource({ id, onPlay }: SourceProps): ReactNode {
  return <StripView view="memory" strip={useMemoryStrip(id)} onPlay={onPlay} />;
}

function MonthSource({ id, onPlay }: SourceProps): ReactNode {
  return <StripView view="month" strip={useMonthStrip(id)} onPlay={onPlay} />;
}

const SOURCES: Readonly<Record<PhotosChatWidget['view'], (props: SourceProps) => ReactNode>> = {
  item: ItemSource,
  album: AlbumSource,
  memory: MemorySource,
  month: MonthSource,
};

export function PhotosWidget({ widget }: { readonly widget: PhotosChatWidget }): ReactNode {
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const [playing, setPlaying] = useState<Memory | null>(null);
  const Source = SOURCES[widget.view];
  return (
    <>
      {validPhotosWidget(widget) ? (
        <Source id={widget.id} onPlay={setPlaying} />
      ) : (
        <ProblemNote
          view={widget.view}
          strip={{ status: 'missing', reason: PHOTOS_WIDGET_COPY.gone }}
        />
      )}
      {playing === null ? null : (
        <MemoryPlayer
          key={playing.id}
          memory={playing}
          compact={compact}
          onClose={() => {
            setPlaying(null);
          }}
        />
      )}
    </>
  );
}
