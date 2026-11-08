import type { ReactNode } from 'react';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import type { VideoThumbnail } from 'expo-video';
import { Logger } from '@smarteverything/logging';
import { useMotion } from '../../design/motion';
import { ThemeScope } from '../../design/theme-scope';
import { useScopeVisible } from '../../design/visibility';
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

export const TILE_FADE_MS = 120;

export type Thumbnail = string | VideoThumbnail;
export type ResolveThumb = (tile: MediaTile) => Promise<Thumbnail | null>;

export interface TileActions {
  readonly resolveThumb: ResolveThumb;
  readonly onOpen: (tile: MediaTile) => void;
  readonly onMenu?: (tile: MediaTile, point: Point | null) => void;
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

function useThumb(tile: MediaTile, resolve: ResolveThumb, wanted: boolean): Thumbnail | null {
  const visible = useScopeVisible();
  const key = tileKey(tile);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const due = wanted && visible && resolved?.key !== key;
  useEffect(() => {
    if (!due) return undefined;
    let current = true;
    resolve(tile)
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
  }, [due, key, resolve, tile]);
  useEffect(
    () => (): void => {
      const url = resolved?.url;
      if (url !== undefined && url !== null && typeof url !== 'string') url.release();
    },
    [resolved],
  );
  if (!visible && resolved !== null) setResolved(null);
  return resolved?.key === key ? resolved.url : null;
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

type PictureSource =
  | { readonly uri: string; readonly cacheKey: string }
  | { readonly thumbhash: string }
  | VideoThumbnail;

function sourceOf(tile: MediaTile, url: Thumbnail | null): PictureSource | null {
  if (url !== null) return typeof url === 'string' ? { uri: url, cacheKey: tileKey(tile) } : url;
  return tile.thumbhash === null ? null : { thumbhash: tile.thumbhash };
}

function Picture({ tile, url, onFailed }: PictureProps): ReactNode {
  const motion = useMotion();
  return (
    <Image
      source={sourceOf(tile, url)}
      placeholder={tile.thumbhash === null ? null : { thumbhash: tile.thumbhash }}
      placeholderContentFit="cover"
      contentFit="cover"
      recyclingKey={tileKey(tile)}
      cachePolicy="disk"
      transition={motion.reduced ? 0 : TILE_FADE_MS}
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
}

function Tile({ tile, width, height, resolveThumb, onOpen, onMenu }: MediaTileProps): ReactNode {
  const [failed, setFailed] = useState<string | null>(null);
  const key = tileKey(tile);
  const state = failed === key ? 'unreadable' : tileState(tile);
  const url = useThumb(tile, resolveThumb, state === 'ready');
  const marks = state === 'ready' ? tileMarks(tile) : null;
  return (
    <View style={boxOf(width, height)}>
      <Interactive
        label={tileLabel(tile)}
        className="size-full rounded-xs bg-surface-3"
        onPress={() => {
          onOpen(tile);
        }}
        onLongPress={
          onMenu === undefined
            ? undefined
            : (): void => {
                onMenu(tile, null);
              }
        }
        onContextMenu={
          onMenu === undefined
            ? undefined
            : (point: Point): void => {
                onMenu(tile, point);
              }
        }
      >
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
        {marks !== null && hasMarks(marks) ? <Marks marks={marks} /> : null}
      </Interactive>
    </View>
  );
}

export const MediaTileView = memo(Tile);
