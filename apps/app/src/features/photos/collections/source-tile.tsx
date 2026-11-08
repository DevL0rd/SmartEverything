import { memo, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import type { PhotoSource } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { TILE_FADE_MS } from '../../../components/media-grid/tile';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useMotion } from '../../../design/motion';
import { ThemeScope } from '../../../design/theme-scope';
import { useScopeVisible } from '../../../design/visibility';
import { playTime } from '../../../format/time';
import { sourceLinks, SOURCE_REV } from './source-links';
import { sourceTileLabel, type SourceTile } from './source-model';

const log = new Logger('app.photos');

export interface SourceTileHandlers {
  readonly onPress: (tile: SourceTile) => void;
  readonly onLongPress: (tile: SourceTile) => void;
}

export interface SourceTileProps extends SourceTileHandlers {
  readonly source: PhotoSource;
  readonly tile: SourceTile;
  readonly width: number;
  readonly height: number;
  readonly selecting: boolean;
  readonly picked: boolean;
}

interface Resolved {
  readonly id: string;
  readonly url: string | null;
}

function boxOf(width: number, height: number): ViewStyle {
  return { width, height };
}

function useThumb(source: PhotoSource, id: string): string | null {
  const visible = useScopeVisible();
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const due = visible && resolved?.id !== id;
  useEffect(() => {
    if (!due) return undefined;
    let current = true;
    sourceLinks[source]
      .resolve(id, SOURCE_REV, 'thumb')
      .then((url) => {
        if (current) setResolved({ id, url });
      })
      .catch((error: unknown) => {
        log.error('photos.sources.thumb_failed', error, { source });
      });
    return (): void => {
      current = false;
    };
  }, [due, id, source]);
  return resolved?.id === id ? resolved.url : null;
}

function Check({ picked }: { readonly picked: boolean }): ReactNode {
  return (
    <View
      pointerEvents="none"
      className={cn(
        'absolute left-1.5 top-1.5 size-5 items-center justify-center rounded-full border-2',
        picked ? 'border-primary bg-primary' : 'border-white/90 bg-black/20',
      )}
    >
      {picked ? <Icon name="check" size={16} tone="onPrimary" /> : null}
    </View>
  );
}

function Marks({ tile }: { readonly tile: SourceTile }): ReactNode {
  return (
    <ThemeScope theme="dark">
      {tile.kept ? (
        <View
          pointerEvents="none"
          className="absolute right-1.5 top-1.5 flex-row items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5"
        >
          <Icon name="check" size={16} tone="positive" />
          <Text variant="caption">Kept</Text>
        </View>
      ) : null}
      {tile.video ? (
        <View
          pointerEvents="none"
          className="absolute bottom-1.5 right-1.5 flex-row items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5"
        >
          <Icon name="play" size={16} tone="default" />
          {tile.durationMs === null ? null : (
            <Text variant="caption" className="tabular-nums">
              {playTime(tile.durationMs / 1000)}
            </Text>
          )}
        </View>
      ) : null}
    </ThemeScope>
  );
}

function Picture({
  source,
  tile,
}: {
  readonly source: PhotoSource;
  readonly tile: SourceTile;
}): ReactNode {
  const url = useThumb(source, tile.id);
  const motion = useMotion();
  if (url === null) {
    return (
      <View className="absolute inset-0 items-center justify-center">
        <Icon name={tile.video ? 'film' : 'image'} size={20} tone="faint" />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: url, cacheKey: `${source}:${tile.id}` }}
      contentFit="cover"
      recyclingKey={tile.id}
      cachePolicy="disk"
      transition={motion.reduced ? 0 : TILE_FADE_MS}
      onError={(event) => {
        log.warn('photos.sources.thumb_load_failed', { source, reason: event.error });
      }}
      style={StyleSheet.absoluteFill}
      accessible={false}
    />
  );
}

function Tile(props: SourceTileProps): ReactNode {
  const { source, tile, width, height, selecting, picked } = props;
  return (
    <View style={boxOf(width, height)}>
      <Interactive
        label={sourceTileLabel(tile)}
        checked={selecting ? picked : undefined}
        className={cn(
          'size-full overflow-hidden rounded-xs bg-surface-3',
          picked && 'border-2 border-primary',
        )}
        onPress={() => {
          props.onPress(tile);
        }}
        onLongPress={
          selecting
            ? undefined
            : (): void => {
                props.onLongPress(tile);
              }
        }
      >
        <Picture source={source} tile={tile} />
        <Marks tile={tile} />
        {selecting ? <Check picked={picked} /> : null}
      </Interactive>
    </View>
  );
}

export const SourceTileView = memo(Tile);
