import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Logger } from '@smarteverything/logging';
import { EmptyState } from '../../../../components/empty-state';
import { IconButton } from '../../../../components/icon-button';
import type { MediaTile } from '../../../../components/media-grid/tiles';
import { Skeleton } from '../../../../components/skeleton';
import { Text } from '../../../../components/text';
import { ToastModal } from '../../../../components/toast-modal';
import { useEscape } from '../../../../components/use-escape';
import { cn } from '../../../../design/cn';
import { useIsPhone } from '../../../../design/size-class';
import { ThemeScope } from '../../../../design/theme-scope';
import { dateFormat } from '../../../../format/locale';
import { useViewerKeys } from '../../viewer/keys';
import { LocalPlayback } from '../../viewer/local-playback';
import { useSwipe } from '../../viewer/swipe';
import type { PickAction } from '../selection-bar';
import { lockedLinks } from './links';
import { lockedNeighbours, type LockedNeighbours } from './locked-model';

const log = new Logger('app.photos');

type LinkState =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly url: string }
  | { readonly state: 'missing' };

function useLockedLink(tile: MediaTile, size: 'preview' | 'playable'): LinkState {
  const key = `${tile.id}:${String(tile.rev)}:${size}`;
  const [link, setLink] = useState<{ readonly key: string; readonly state: LinkState } | null>(
    null,
  );
  useEffect(() => {
    let current = true;
    lockedLinks
      .resolve(tile.id, tile.rev, size)
      .then((url) => {
        if (current) {
          setLink({ key, state: url === null ? { state: 'missing' } : { state: 'ready', url } });
        }
      })
      .catch((error: unknown) => {
        log.warn('locked.viewer_link_failed', { size, reason: String(error) });
        if (current) setLink({ key, state: { state: 'missing' } });
      });
    return (): void => {
      current = false;
    };
  }, [tile.id, tile.rev, size, key]);
  return link?.key === key ? link.state : { state: 'loading' };
}

function Media({ tile }: { readonly tile: MediaTile }): ReactNode {
  const video = tile.durationMs !== null;
  const link = useLockedLink(tile, video ? 'playable' : 'preview');
  const [failed, setFailed] = useState(false);
  if (link.state === 'loading') {
    return (
      <Skeleton shape="block" className="h-2/3 w-full self-center rounded-none bg-surface-2" />
    );
  }
  if (link.state === 'missing' || failed) {
    return (
      <EmptyState
        icon={video ? 'film' : 'image'}
        title={video ? 'This video is not ready to play' : 'This photo has no preview yet'}
        body="The hub is still preparing it. Move it out of the Locked folder to open it in Drive."
      />
    );
  }
  if (video) return <LocalPlayback uri={link.url} />;
  return (
    <Image
      source={{ uri: link.url, cacheKey: `locked:${tile.id}:${String(tile.rev)}` }}
      contentFit="contain"
      accessibilityLabel={takenText(tile)}
      onError={() => {
        setFailed(true);
      }}
      style={StyleSheet.absoluteFill}
    />
  );
}

function takenText(tile: MediaTile): string {
  return dateFormat({
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(tile.takenAt);
}

function Header({
  tile,
  place,
  actions,
  busy,
  onClose,
}: {
  readonly tile: MediaTile;
  readonly place: LockedNeighbours;
  readonly actions: readonly PickAction[];
  readonly busy: boolean;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <View className="min-h-16 flex-row items-center gap-2 px-4 pt-safe">
      <IconButton icon="arrowLeft" label="Close viewer" onPress={onClose} shortcut="Esc" />
      <View className="min-w-0 flex-1">
        <Text variant="label" numberOfLines={1}>
          {takenText(tile)}
        </Text>
        <Text variant="caption" tone="variant" className="tabular-nums">
          {`${String(place.position)} of ${String(place.total)} · Locked folder`}
        </Text>
      </View>
      {actions.map((action) => (
        <IconButton
          key={action.id}
          icon={action.icon}
          label={action.label}
          disabled={busy}
          {...(action.look === 'destructive' ? { tone: 'critical' as const } : {})}
          onPress={action.onPress}
        />
      ))}
    </View>
  );
}

function Step({
  side,
  tile,
  onGo,
}: {
  readonly side: 'previous' | 'next';
  readonly tile: MediaTile | null;
  readonly onGo: (tile: MediaTile) => void;
}): ReactNode {
  return (
    <IconButton
      icon={side === 'previous' ? 'chevronLeft' : 'chevronRight'}
      label={side === 'previous' ? 'Previous photo' : 'Next photo'}
      variant="tonal"
      disabled={tile === null}
      shortcut={side === 'previous' ? '←' : '→'}
      onPress={() => {
        if (tile !== null) onGo(tile);
      }}
    />
  );
}

export interface LockedViewerProps {
  readonly tiles: readonly MediaTile[];
  readonly itemId: string;
  readonly actions: readonly PickAction[];
  readonly busy: boolean;
  readonly onGo: (itemId: string) => void;
  readonly onClose: () => void;
}

function Stage(props: LockedViewerProps & { readonly place: LockedNeighbours }): ReactNode {
  const touch = useIsPhone();
  const go = (tile: MediaTile): void => {
    props.onGo(tile.id);
  };
  const swipe = useSwipe(touch, (choice) => {
    if (choice === 'close') {
      props.onClose();
      return;
    }
    const tile = choice === 'next' ? props.place.next : props.place.previous;
    if (tile !== null) go(tile);
  });
  return (
    <View className={cn('min-h-0 flex-1 flex-row items-center', touch ? '' : 'gap-4 px-4')}>
      {touch ? null : <Step side="previous" tile={props.place.previous} onGo={go} />}
      <GestureDetector gesture={swipe.gesture}>
        <Animated.View
          style={swipe.style}
          className="size-full min-w-0 flex-1 justify-center"
          onLayout={(event) => {
            swipe.measure(event.nativeEvent.layout.width, event.nativeEvent.layout.height);
          }}
        >
          <Media key={props.place.current.id} tile={props.place.current} />
        </Animated.View>
      </GestureDetector>
      {touch ? null : <Step side="next" tile={props.place.next} onGo={go} />}
    </View>
  );
}

export function LockedViewer(props: LockedViewerProps): ReactNode {
  const place = lockedNeighbours(props.tiles, props.itemId);
  useEscape(place !== null, props.onClose);
  useViewerKeys(place !== null, (action) => {
    if (place === null || (action !== 'next' && action !== 'previous')) return;
    const tile = action === 'next' ? place.next : place.previous;
    if (tile !== null) props.onGo(tile.id);
  });
  if (place === null) return null;
  return (
    <ToastModal visible animationType="fade" onRequestClose={props.onClose} statusBarTranslucent>
      <ThemeScope theme="dark">
        <View className="min-h-0 flex-1 bg-black pb-safe">
          <Header
            tile={place.current}
            place={place}
            actions={props.actions}
            busy={props.busy}
            onClose={props.onClose}
          />
          <Stage {...props} place={place} />
        </View>
      </ThemeScope>
    </ToastModal>
  );
}
