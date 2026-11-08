import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { Memory, PhotosPref } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { Button } from '../../../components/button';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import {
  WidgetEmpty,
  WidgetFrame,
  WidgetHeader,
  WidgetSurface,
  type WidgetDefinition,
  type WidgetSize,
} from '../../../components/widget-board';
import { allSizes } from '../../../components/widget-board/all-sizes';
import { WIDGET_BODY_GAP } from '../../../components/widget-board/widget-frame-metrics';
import { useAreaWidth } from '../../../design/size-class';
import { PREFS, usePref } from '../../../store/prefs';
import { useSyncStatus } from '../../../store/selectors';
import { libraryLayoutOf } from '../../nas/frame/sections';
import { usePhotoMemories } from '../data';
import { MemoryPlayer } from '../memories/memory-player';
import { BoardFace, OnThisDayFace } from './memories-faces';
import { boardTilesOf, dayMonthText, heroesOf, memoriesText } from './memories-model';

export const MEMORIES_WIDGET_COPY = {
  off: {
    title: 'Memories are off',
    body: 'Turn Memories on in Photos settings to see them here.',
    action: 'Open settings',
  },
  none: {
    title: 'Nothing from this day yet',
    body: 'Photos from this date in earlier years show here on the day.',
    action: 'Open Memories',
  },
  empty: {
    title: 'No memories yet',
    body: 'Memories appear once Photos has pictures from earlier years, days out or trips.',
    action: 'Open Timeline',
  },
  offline: 'Hub offline',
  unreachable: {
    title: 'The hub is offline',
    body: 'Memories show here once the hub is back.',
  },
} as const;

const FRAME = { icon: 'clock', accent: 'viz-1', href: href.photosPage('memories') } as const;

const BODY_STYLE = { gap: WIDGET_BODY_GAP };

type Face = 'day' | 'board';

const TITLES: Readonly<Record<Face, string>> = { day: 'On this day', board: 'Memories' };

function faceOf(size: WidgetSize): Face {
  return size === 'M' ? 'day' : 'board';
}

function usePhotosPrefs(): PhotosPref {
  const read = usePref(PREFS.photos);
  return read.status === 'invalid' ? PREFS.photos.defaultValue : read.value;
}

function Offline(): ReactNode {
  return (
    <Text variant="caption" tone="warning" numberOfLines={1}>
      {MEMORIES_WIDGET_COPY.offline}
    </Text>
  );
}

function Notice({
  face,
  copy,
  link,
}: {
  readonly face: Face;
  readonly copy: { readonly title: string; readonly body: string; readonly action: string };
  readonly link: AppHref;
}): ReactNode {
  return (
    <WidgetFrame title={TITLES[face]} {...FRAME}>
      <WidgetEmpty
        icon="clock"
        colour="viz-1"
        title={copy.title}
        body={copy.body}
        action={{ label: copy.action, href: link }}
      />
    </WidgetFrame>
  );
}

function Pending({ face }: { readonly face: Face }): ReactNode {
  const offline = useSyncStatus().status === 'interrupted';
  return (
    <WidgetFrame title={TITLES[face]} {...FRAME}>
      {offline ? (
        <WidgetEmpty
          icon="wifi-off"
          colour="warning"
          title={MEMORIES_WIDGET_COPY.unreachable.title}
          body={MEMORIES_WIDGET_COPY.unreachable.body}
        />
      ) : (
        <Skeleton shape="block" className="flex-1" />
      )}
    </WidgetFrame>
  );
}

function BoardFrame({
  memories,
  offline,
  editing,
  onPlay,
}: {
  readonly memories: readonly Memory[];
  readonly offline: boolean;
  readonly editing: boolean;
  readonly onPlay: (memory: Memory) => void;
}): ReactNode {
  const first = memories[0];
  return (
    <WidgetSurface className="p-card-pad" style={BODY_STYLE}>
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <WidgetHeader
            title={TITLES.board}
            {...FRAME}
            badge={
              offline ? (
                <Offline />
              ) : (
                <Text variant="caption" tone="variant" className="tabular-nums">
                  {memoriesText(memories.length)}
                </Text>
              )
            }
          />
        </View>
        {first === undefined ? null : (
          <Button
            label="Play"
            icon="play"
            variant="tonal"
            disabled={editing}
            onPress={() => {
              onPlay(first);
            }}
          />
        )}
      </View>
      <BoardFace memories={memories} editing={editing} onPlay={onPlay} />
    </WidgetSurface>
  );
}

function Loaded({
  face,
  memories,
  prefs,
  editing,
  onPlay,
}: {
  readonly face: Face;
  readonly memories: readonly Memory[];
  readonly prefs: PhotosPref;
  readonly editing: boolean;
  readonly onPlay: (memory: Memory) => void;
}): ReactNode {
  const offline = useSyncStatus().status === 'interrupted';
  if (face === 'board') {
    const tiles = boardTilesOf(memories, prefs.yearInReview);
    return tiles.length === 0 ? (
      <Notice face={face} copy={MEMORIES_WIDGET_COPY.empty} link={href.photos()} />
    ) : (
      <BoardFrame memories={tiles} offline={offline} editing={editing} onPlay={onPlay} />
    );
  }
  const heroes = heroesOf(memories);
  const first = heroes[0];
  if (first === undefined) {
    return <Notice face={face} copy={MEMORIES_WIDGET_COPY.none} link={FRAME.href} />;
  }
  return (
    <WidgetFrame
      title={TITLES.day}
      {...FRAME}
      badge={
        offline ? (
          <Offline />
        ) : (
          <Text variant="caption" tone="variant">
            {dayMonthText(first.from)}
          </Text>
        )
      }
    >
      <OnThisDayFace heroes={heroes} editing={editing} onPlay={onPlay} />
    </WidgetFrame>
  );
}

function Body({
  face,
  prefs,
  editing,
  onPlay,
}: {
  readonly face: Face;
  readonly prefs: PhotosPref;
  readonly editing: boolean;
  readonly onPlay: (memory: Memory) => void;
}): ReactNode {
  const memories = usePhotoMemories();
  if (memories.data !== undefined) {
    return (
      <Loaded
        face={face}
        memories={memories.data}
        prefs={prefs}
        editing={editing}
        onPlay={onPlay}
      />
    );
  }
  if (memories.error !== null) {
    return (
      <WidgetFrame
        title={TITLES[face]}
        {...FRAME}
        actions={
          <Button
            label="Try again"
            variant="tonal"
            onPress={() => {
              background(memories.refetch(), 'photos.memories_refetch_failed');
            }}
          />
        }
      >
        <ErrorState error={memories.error} />
      </WidgetFrame>
    );
  }
  return <Pending face={face} />;
}

export function MemoriesWidget({
  size,
  editing,
}: {
  readonly size: WidgetSize;
  readonly editing: boolean;
}): ReactNode {
  const prefs = usePhotosPrefs();
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const [playing, setPlaying] = useState<Memory | null>(null);
  const face = faceOf(size);
  return (
    <>
      {prefs.memories ? (
        <Body face={face} prefs={prefs} editing={editing} onPlay={setPlaying} />
      ) : (
        <Notice face={face} copy={MEMORIES_WIDGET_COPY.off} link={href.settings.page('photos')} />
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

export const MEMORIES_WIDGET: WidgetDefinition = {
  type: 'photo-memories',
  title: 'Memories',
  icon: 'clock',
  group: 'Photos',
  sizes: allSizes('M', 'W'),
  defaultSize: 'W',
  render: ({ size, editing }) => <MemoriesWidget size={size} editing={editing} />,
};
