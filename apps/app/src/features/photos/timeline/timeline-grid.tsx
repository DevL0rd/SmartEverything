import { useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Dimensions, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { centredRect, pointRect, type Rect } from '../../../components/anchor';
import { Button } from '../../../components/button';
import type { Point } from '../../../components/interactive';
import type { DayText } from '../../../components/media-grid/day-text';
import type { MediaZoomStep } from '../../../components/media-grid/justify';
import { MediaGrid, type DayDecor } from '../../../components/media-grid/media-grid';
import {
  dayActionText,
  dayMark,
  type MediaSelectionControls,
} from '../../../components/media-grid/selection';
import type { MediaDay, MediaGrouping, MediaTile } from '../../../components/media-grid/tiles';
import { useZoomSteps } from '../../../components/media-grid/zoom-steps';
import { Menu } from '../../../components/menu';
import { useIdiom } from '../../../design/platform';
import { heavyThud } from '../../../platform/haptics';
import { useDayKey } from '../../../store/clock';
import { driveLinks } from '../../nas/data/links';
import { localIdOf } from '../local/store';
import { localThumbnail } from './local-thumbnail';
import type { Thumbnail } from '../../../components/media-grid/tile';
import { dayIds } from './timeline-model';
import { tileMenu, type TileMenuActions } from './tile-menu';
import type { MediaActions } from './use-media-actions';

export interface TimelineGridProps {
  readonly tiles: readonly MediaTile[];
  readonly step: MediaZoomStep;
  readonly onStep: (step: MediaZoomStep) => void;
  readonly selection: MediaSelectionControls;
  readonly media: MediaActions;
  readonly empty: ReactElement;
  readonly footer: ReactElement;
  readonly onEnd: () => void;
  readonly grouping?: MediaGrouping;
  readonly headText?: (group: MediaDay) => DayText;
}

type MenuMode = 'actions' | 'albums';

interface Opened {
  readonly tile: MediaTile;
  readonly anchor: Rect;
  readonly mode: MenuMode;
}

function resolveThumb(tile: MediaTile): Promise<Thumbnail | null> {
  const local = localIdOf(tile);
  return local === null ? driveLinks.resolve(tile.id, tile.rev, 'thumb') : localThumbnail(tile);
}

function openViewer(tile: MediaTile): void {
  router.push(href.photosItem(tile.id));
}

export function menuActionsOf(
  media: MediaActions,
  selection: MediaSelectionControls,
  onAlbums: (tile: MediaTile) => void,
): TileMenuActions {
  return {
    chatHint: media.chatHint,
    open: openViewer,
    favourite: (tile, on): void => {
      media.favourite([tile.id], on);
    },
    select: (tile): void => {
      selection.day([tile.id]);
    },
    album: onAlbums,
    chat: (tile): void => {
      media.toChat([tile.id]);
    },
    share: (tile): void => {
      media.share(tile.id);
    },
    download: (tile): void => {
      media.download([tile.id]);
    },
    drive: (tile): void => {
      media.showInDrive(tile.id);
    },
    ask: (tile): void => {
      media.ask(tile.id);
    },
    trash: (tile): void => {
      media.trash([tile.id], selection.clear);
    },
  };
}

function useDecor(
  selection: MediaSelectionControls,
  headText: TimelineGridProps['headText'],
): DayDecor {
  const { selection: state, day } = selection;
  return useMemo(
    () => ({
      placeOf: () => null,
      ...(headText === undefined ? {} : { textOf: headText }),
      actionOf: (media): ReactElement => {
        const ids = dayIds(media.tiles);
        return (
          <Button
            label={state.active ? dayActionText(dayMark(state, ids)) : 'Select'}
            variant="text"
            onPress={() => {
              day(ids);
            }}
          />
        );
      },
    }),
    [state, day, headText],
  );
}

interface HostProps {
  readonly opened: Opened | null;
  readonly media: MediaActions;
  readonly selection: MediaSelectionControls;
  readonly onOpened: (opened: Opened | null) => void;
}

function TileMenuHost({ opened, media, selection, onOpened }: HostProps): ReactNode {
  const touch = useIdiom() === 'touch';
  if (opened === null) return null;
  const close = (): void => {
    onOpened(null);
  };
  if (opened.mode === 'albums') {
    return (
      <Menu
        key="albums"
        options={{}}
        items={media.albums([opened.tile.id])}
        anchor={opened.anchor}
        label="Add to album"
        onClose={close}
      />
    );
  }
  const actions = menuActionsOf(media, selection, (tile) => {
    onOpened({ ...opened, tile, mode: 'albums' });
  });
  const menu = tileMenu(opened.tile, actions, touch);
  return (
    <Menu
      key="actions"
      items={menu.items}
      options={{ quick: menu.quick }}
      anchor={opened.anchor}
      label="Photo actions"
      onClose={close}
    />
  );
}

function anchorOf(point: Point | null): Rect {
  return point === null ? centredRect(Dimensions.get('window')) : pointRect(point.x, point.y);
}

export function TimelineGrid(props: TimelineGridProps): ReactNode {
  const { tiles, step, onStep, selection, media, empty, footer, onEnd } = props;
  const frame = useRef<View>(null);
  const zoom = useZoomSteps(frame, step, (next) => {
    onStep(next);
  });
  const [opened, setOpened] = useState<Opened | null>(null);
  const decor = useDecor(selection, props.headText);
  const today = useDayKey();
  return (
    <GestureDetector gesture={zoom}>
      <View ref={frame} collapsable={false} className="min-h-0 flex-1">
        <MediaGrid
          tiles={tiles}
          step={step}
          today={today}
          grouping={props.grouping ?? 'day'}
          decor={decor}
          empty={empty}
          footer={footer}
          onEndReached={onEnd}
          probe="photos.timeline"
          resolveThumb={resolveThumb}
          onOpen={(tile) => {
            if (!selection.press(tile.id, { shift: false })) openViewer(tile);
          }}
          onMenu={(tile: MediaTile, point: Point | null) => {
            if (point === null) heavyThud();
            setOpened({ tile, anchor: anchorOf(point), mode: 'actions' });
          }}
        />
        <TileMenuHost opened={opened} media={media} selection={selection} onOpened={setOpened} />
      </View>
    </GestureDetector>
  );
}
