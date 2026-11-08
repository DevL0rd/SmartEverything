import { useMemo, useState, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import type { HomeMap, HomeMapLookPref } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { AppHref } from '../../../components/app-href';
import type { CameraPresetId } from '../../../components/house-map/3d/render-core-orbit';
import type { RenderFloor, RenderScene } from '../../../components/house-map/render-scene';
import type { StageLiveProps } from '../../../components/house-map/live-visibility/stage-host';
import { cn } from '../../../design/cn';
import { PREFS, prefValueOf } from '../../../store/prefs';
import { sameJson } from '../../../store/same-json';
import { useSyncStatus } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import {
  HomeMap3d,
  type HomeMap3dProps,
  type HomeMapLive,
  type HomeMapState,
  Stage,
  type StageContext,
  stageDimmed,
  stageIdOf,
  stageNotices,
  stageNoticesNode,
  StageStillView,
  type StageViewOption,
  useHomeMap,
  useHomeMapLive,
  useHomeMapScene,
  useStageLights,
} from '../../home-map';
import { HOME_MAP_EDITOR, heroPickTarget, heroTapTarget } from '../model/hero';
import { roomFocus, type RoomFocus } from '../model/room-focus';

const log = new Logger('app.home');

type HeaderView = '3d';

const VIEWS: readonly StageViewOption<HeaderView>[] = [
  { value: '3d', label: '3D', spoken: 'Show the map in 3D', icon: 'box' },
];

export const ROOM_HEADER_PRESET: CameraPresetId = 'top';

const NO_STATE = { unavailable: false } as const;

const UNAVAILABLE_STATE = { unavailable: true } as const;

const ROOM_MAP_MIN_HEIGHT = 165;
const ROOM_MAP_MAX_WINDOW_SHARE = 0.4;

interface RoomShown {
  readonly map: HomeMap;
  readonly scene: RenderScene;
  readonly floor: RenderFloor;
  readonly focus: RoomFocus;
}

function useRoomShown(map: HomeMap | null, roomId: string): RoomShown | null {
  const scene = useHomeMapScene(map);
  return useMemo(() => {
    if (map === null || scene === null) return null;
    const focus = roomFocus(scene.floors, roomId);
    const floor = scene.floors.find((item) => item.id === focus?.floor.id);
    return focus === null || floor === undefined ? null : { map, scene, floor, focus };
  }, [map, scene, roomId]);
}

interface FocusedMapProps {
  readonly shown: RoomShown;
  readonly name: string;
  readonly dimmed: boolean;
  readonly context: StageContext;
  readonly live: StageLiveProps;
}

interface RoomMap3dInput {
  readonly shown: RoomShown;
  readonly name: string;
  readonly look: HomeMapLookPref;
  readonly context: StageContext;
  readonly live: StageLiveProps;
  readonly feed: HomeMapLive;
  readonly go: (target: AppHref | null, kind: string) => void;
}

export function roomMap3d(input: RoomMap3dInput): HomeMap3dProps {
  const { shown, name, look, context, live, feed, go } = input;
  const { floor, focus } = shown;
  return {
    scene: shown.scene,
    floor,
    view3d: context.view3d,
    chrome: context.chrome,
    insets: context.chromeInsets,
    label: feed.summary,
    selection: focus.mapRoomIds,
    frameRooms: focus.mapRoomIds,
    selectedItem: null,
    look,
    live,
    feed,
    fallback: (
      <View className="absolute inset-0" onLayout={live.onReady}>
        <StageStillView
          input={{ floor: focus.floor, activeRoomIds: focus.mapRoomIds }}
          name={name}
          state={UNAVAILABLE_STATE}
        />
      </View>
    ),
    realistic: null,
    onPickRoom: (roomId): void => {
      go(heroPickTarget(floor, roomId), 'room');
    },
    onPickDevice: (deviceId): void => {
      go(heroTapTarget(floor, { kind: 'device', id: deviceId }), 'device');
    },
  };
}

function FocusedMap({ shown, name, dimmed, context, live }: FocusedMapProps): ReactNode {
  const router = useRouter();
  const look = useStoreSelector(
    (state): HomeMapLookPref => prefValueOf(state, PREFS.homeMapLook),
    sameJson,
  );
  const request = useMemo(() => ({ mapName: name, animate: live.active }), [name, live.active]);
  const feed = useHomeMapLive(shown.map, shown.floor, look, request);
  const go = (target: AppHref | null, kind: string): void => {
    if (target === null) return;
    log.info('room_header.tap', { kind });
    router.push(target);
  };
  return (
    <View className={cn('absolute inset-0', dimmed && 'opacity-60')}>
      <HomeMap3d {...roomMap3d({ shown, name, look, context, live, feed, go })} />
    </View>
  );
}

export interface RoomMapHeaderProps {
  readonly roomId: string;
  readonly roomName: string;
  readonly covered: boolean;
  readonly sideBySide: boolean;
}

function headerNotices(
  { failure, retry }: HomeMapState,
  connected: boolean,
  onEdit: () => void,
): ReactNode {
  return stageNoticesNode(
    stageNotices(
      {
        phase: 'map',
        connected,
        loadFailed: failure !== null,
        crashed: false,
        leaseFailed: false,
        madeFromRobot: false,
        mapNotices: [],
      },
      { onEdit, onRetryLoad: retry },
    ),
  );
}

function RoomMapFrame({
  sideBySide,
  children,
}: {
  readonly sideBySide: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const { height } = useWindowDimensions();
  const maxHeight = Math.max(ROOM_MAP_MIN_HEIGHT, Math.round(height * ROOM_MAP_MAX_WINDOW_SHARE));
  const frameStyle = { maxHeight };
  return (
    <View
      className={cn('aspect-video', sideBySide ? 'min-w-0 flex-2' : 'w-full')}
      style={frameStyle}
    >
      {children}
    </View>
  );
}

export function RoomMapHeader(props: RoomMapHeaderProps): ReactNode {
  const { roomId, roomName, covered, sideBySide } = props;
  const router = useRouter();
  const state = useHomeMap();
  const connected = useSyncStatus().status === 'live';
  const shown = useRoomShown(state.map, roomId);
  const [preset, setPreset] = useState<CameraPresetId>(ROOM_HEADER_PRESET);
  const onEdit = (): void => {
    router.push(HOME_MAP_EDITOR);
  };
  const lights = useStageLights();
  if (shown === null) return null;
  const dimmed = stageDimmed('map', connected);
  return (
    <RoomMapFrame sideBySide={sideBySide}>
      <Stage
        variant="hero"
        className="h-full border-hairline border-outline-variant"
        focus={{ kind: 'room', roomId }}
        views={VIEWS}
        view="3d"
        onViewChange={(): void => undefined}
        tools={{ tools3d: true, lights, onEdit }}
        camera={{ preset, onPreset: setPreset }}
        notices={headerNotices(state, connected, onEdit)}
        content={{
          kind: 'live',
          id: stageIdOf({ kind: 'room-header', roomId }),
          modalCovered: covered,
          still: (
            <StageStillView
              input={{ floor: shown.focus.floor, activeRoomIds: shown.focus.mapRoomIds }}
              name={roomName}
              state={NO_STATE}
            />
          ),
          render: (context, live) => (
            <FocusedMap
              shown={shown}
              name={roomName}
              dimmed={dimmed}
              context={context}
              live={live}
            />
          ),
        }}
      />
    </RoomMapFrame>
  );
}
