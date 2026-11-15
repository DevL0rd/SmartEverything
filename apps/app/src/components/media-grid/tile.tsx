import type { ReactElement, ReactNode } from 'react';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import type { VideoThumbnail } from 'expo-video';
import { Logger } from '@smarteverything/logging';
import { cn } from '../../design/cn';
import { ThemeScope } from '../../design/theme-scope';
import { Icon } from '../icon';
import { Interactive, type Point } from '../interactive';
import { Text } from '../text';
import {
  hasMarks,
  tileLabel,
  tileMarks,
  tileState,
  UNREADABLE_LABEL,
  type TileMarks,
} from './marks';
import type { MediaTile } from './tiles';

const log = new Logger('app.media');

export type Thumbnail = string | VideoThumbnail;

export interface ThumbSource {
  readonly peek: (tile: MediaTile) => string | null;
  readonly resolve: (tile: MediaTile) => Promise<Thumbnail | null>;
}

export type TileBadge = (tile: MediaTile) => ReactElement | null;

export interface TileActions {
  readonly thumbs: ThumbSource;
  readonly onOpen: (tile: MediaTile) => void;
  readonly onMenu?: (tile: MediaTile, point: Point | null) => void;
  readonly badgeOf?: TileBadge;
}

interface Resolved {
  readonly key: string;
  readonly url: Thumbnail | null;
}

export function tileKey(tile: MediaTile): string {
  return `${tile.id}:${String(tile.rev)}`;
}

function boxOf(width: number, height: number): ViewStyle {
  return { width, height };
}

function useThumb(tile: MediaTile, thumbs: ThumbSource, wanted: boolean): Thumbnail | null {
  const key = tileKey(tile);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const due = wanted && resolved?.key !== key;
  useEffect(() => {
    if (!due) return undefined;
    let current = true;
    thumbs
      .resolve(tile)
      .then((url) => {
        if (current) setResolved({ key, url });
        else if (url !== null && typeof url !== 'string') url.release();
      })
      .catch((error: unknown) => {
        log.error('thumb.resolve_failed', error, { local: tile.local });
      });
    return (): void => {
      current = false;
    };
  }, [due, key, thumbs, tile]);
  useEffect(
    () => (): void => {
      const url = resolved?.url;
      if (url !== undefined && url !== null && typeof url !== 'string') url.release();
    },
    [resolved],
  );
  if (resolved?.key === key) return resolved.url;
  return wanted ? thumbs.peek(tile) : null;
}

type MarkIcon = 'play' | 'layers' | 'radio' | 'cloudOff';

function Pill({
  icon,
  text,
}: {
  readonly icon: MarkIcon | null;
  readonly text: string | null;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5">
      {icon === null ? null : <Icon name={icon} size={16} tone="default" />}
      {text === null ? null : (
        <Text variant="caption" className="tabular-nums">
          {text}
        </Text>
      )}
    </View>
  );
}

function Marks({ marks }: { readonly marks: TileMarks }): ReactNode {
  return (
    <ThemeScope theme="dark">
      <View pointerEvents="none" className="absolute right-1.5 top-1.5 flex-row gap-1">
        {marks.live ? <Pill icon="radio" text="LIVE" /> : null}
        {marks.stack ? <Pill icon="layers" text={null} /> : null}
      </View>
      <View pointerEvents="none" className="absolute bottom-1.5 right-1.5 flex-row gap-1">
        {marks.video ? <Pill icon="play" text={marks.duration} /> : null}
        {marks.local ? <Pill icon="cloudOff" text={null} /> : null}
      </View>
      {marks.favourite ? (
        <View
          pointerEvents="none"
          className="absolute bottom-1.5 left-1.5 rounded-full bg-black/50 p-0.5"
        >
          <Icon name="fitness" size={16} tone="default" />
        </View>
      ) : null}
    </ThemeScope>
  );
}

function Unreadable(): ReactNode {
  return (
    <View className="absolute inset-0 items-center justify-center gap-1 bg-surface-2 p-1.5">
      <Icon name="warning" size={16} tone="variant" />
      <Text variant="caption" tone="variant" align="center" numberOfLines={2}>
        {UNREADABLE_LABEL}
      </Text>
    </View>
  );
}

interface PictureProps {
  readonly tile: MediaTile;
  readonly url: Thumbnail | null;
  readonly onFailed: () => void;
}

type PictureSource = { readonly uri: string; readonly cacheKey: string } | VideoThumbnail;

function sourceOf(tile: MediaTile, url: Thumbnail | null): PictureSource | null {
  if (url === null) return null;
  return typeof url === 'string' ? { uri: url, cacheKey: tileKey(tile) } : url;
}

function Picture({ tile, url, onFailed }: PictureProps): ReactNode {
  return (
    <Image
      source={sourceOf(tile, url)}
      contentFit="cover"
      recyclingKey={tileKey(tile)}
      cachePolicy="memory-disk"
      loading="eager"
      onError={(event) => {
        log.warn('thumb.load_failed', { local: tile.local, reason: event.error });
        onFailed();
      }}
      style={StyleSheet.absoluteFill}
      accessible={false}
    />
  );
}

export interface MediaTileProps extends TileActions {
  readonly tile: MediaTile;
  readonly width: number;
  readonly height: number;
  readonly selecting?: boolean;
  readonly selected?: boolean;
}

const SHRUNK: ViewStyle = { transform: [{ scale: 0.9 }] };

function Check({ selected }: { readonly selected: boolean }): ReactNode {
  return (
    <View
      pointerEvents="none"
      className={cn(
        'absolute left-1.5 top-1.5 size-6 items-center justify-center rounded-full border-2',
        selected ? 'border-primary bg-primary' : 'border-white/90 bg-black/25',
      )}
    >
      {selected ? <Icon name="check" size={16} tone="onPrimary" /> : null}
    </View>
  );
}

function Overlays({
  tile,
  ready,
  badgeOf,
  selecting,
}: {
  readonly tile: MediaTile;
  readonly ready: boolean;
  readonly badgeOf: TileBadge | undefined;
  readonly selecting: boolean;
}): ReactNode {
  const marks = ready ? tileMarks(tile) : null;
  const badge = selecting ? null : (badgeOf?.(tile) ?? null);
  return (
    <>
      {marks !== null && hasMarks(marks) ? <Marks marks={marks} /> : null}
      {badge === null ? null : (
        <View pointerEvents="none" className="absolute left-1.5 top-1.5">
          {badge}
        </View>
      )}
    </>
  );
}

function menuHandlers(
  tile: MediaTile,
  onMenu: TileActions['onMenu'],
): {
  readonly onLongPress: (() => void) | undefined;
  readonly onContextMenu: ((point: Point) => void) | undefined;
} {
  if (onMenu === undefined) return { onLongPress: undefined, onContextMenu: undefined };
  return {
    onLongPress: (): void => {
      onMenu(tile, null);
    },
    onContextMenu: (point: Point): void => {
      onMenu(tile, point);
    },
  };
}

function Frame({
  selected,
  children,
}: {
  readonly selected: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      style={selected ? SHRUNK : undefined}
      className={cn(
        'size-full overflow-hidden rounded-xs bg-surface-3',
        selected && 'rounded-sm border-2 border-primary',
      )}
    >
      {children}
    </View>
  );
}

function Tile({
  tile,
  width,
  height,
  thumbs,
  onOpen,
  onMenu,
  badgeOf,
  selecting = false,
  selected = false,
}: MediaTileProps): ReactNode {
  const [failed, setFailed] = useState<string | null>(null);
  const key = tileKey(tile);
  const state = failed === key ? 'unreadable' : tileState(tile);
  const url = useThumb(tile, thumbs, state === 'ready');
  return (
    <View style={boxOf(width, height)} className={cn('rounded-xs', selected && 'bg-primary/15')}>
      <Interactive
        label={tileLabel(tile)}
        {...(selecting ? { role: 'checkbox' as const, checked: selected } : {})}
        className="size-full rounded-xs"
        onPress={() => {
          onOpen(tile);
        }}
        {...menuHandlers(tile, onMenu)}
      >
        <Frame selected={selected}>
          {state === 'unreadable' ? (
            <Unreadable />
          ) : (
            <Picture
              tile={tile}
              url={url}
              onFailed={() => {
                setFailed(key);
              }}
            />
          )}
          <Overlays
            tile={tile}
            ready={state === 'ready'}
            badgeOf={badgeOf}
            selecting={selecting}
          />
        </Frame>
        {selecting ? <Check selected={selected} /> : null}
      </Interactive>
    </View>
  );
}

export const MediaTileView = memo(Tile);
