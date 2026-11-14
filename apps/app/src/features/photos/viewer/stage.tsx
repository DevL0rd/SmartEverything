import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import type { MediaInfo } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { cn } from '../../../design/cn';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { ViewerVideo } from './video-player';
import { useDriveLink } from '../../drive';
import { ViewerPhoto } from './photo';
import type { MediaItem } from './info-model';
import { useSwipe, type SwipeChoice } from './swipe';

export interface StageMoves {
  readonly previous: MediaTile | null;
  readonly next: MediaTile | null;
  readonly onGo: (tile: MediaTile) => void;
  readonly onClose: () => void;
}

function chosen(moves: StageMoves, choice: SwipeChoice): void {
  if (choice === 'close') {
    moves.onClose();
    return;
  }
  const tile = choice === 'next' ? moves.next : moves.previous;
  if (tile !== null) moves.onGo(tile);
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

function usePlayableLink(item: MediaItem, media: MediaInfo | null): string | null {
  return useDriveLink(
    item.kind === 'video' && media?.playable.state === 'ready' ? item.id : null,
    item.rev,
    'playable',
  );
}

export function ViewerStage({
  item,
  media,
  tile,
  moves,
  touch,
}: {
  readonly item: MediaItem;
  readonly media: MediaInfo | null;
  readonly tile: MediaTile | null;
  readonly moves: StageMoves;
  readonly touch: boolean;
}): ReactNode {
  const source = usePlayableLink(item, media);
  const [zoomed, setZoomed] = useState(false);
  const swipe = useSwipe(touch && !zoomed, (choice) => {
    chosen(moves, choice);
  });
  return (
    <View className={cn('min-h-0 flex-1 flex-row items-center', touch ? '' : 'gap-4 px-4')}>
      {touch ? null : <Step side="previous" tile={moves.previous} onGo={moves.onGo} />}
      <GestureDetector gesture={swipe.gesture}>
        <Animated.View
          style={swipe.style}
          className="size-full min-w-0 flex-1"
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            swipe.measure(width, height);
          }}
        >
          {item.kind === 'video' ? (
            <ViewerVideo
              item={item}
              media={media}
              source={source}
              available
              phone={touch}
              onScrubbing={setZoomed}
            />
          ) : (
            <ViewerPhoto item={item} media={media} tile={tile} onZoomed={setZoomed} />
          )}
        </Animated.View>
      </GestureDetector>
      {touch ? null : <Step side="next" tile={moves.next} onGo={moves.onGo} />}
    </View>
  );
}
