import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import type { HomeMap, HomeMapLookPref, HomeMapStageView } from '@smarteverything/domain';
import { deviceKey } from '../../../components/house-map/3d/scene-object-boxes';
import type { StageLiveProps } from '../../../components/house-map/live-visibility/stage-host';
import type { RenderFloor, RenderScene } from '../../../components/house-map/render-scene';
import { cn } from '../../../design/cn';
import { PREFS, prefValueOf } from '../../../store/prefs';
import { sameJson } from '../../../store/same-json';
import { useStoreSelector } from '../../../store/store-context';
import {
  type HeroRealistic,
  HomeMap3d,
  type HomeMap3dProps,
  type HomeMapLive,
  type HomeMapSelection,
  type StageContext,
  StageStillView,
  useHomeMapLive,
} from '../../home-map';
import { selectedRooms, selectionOfHit } from '../model/map-pick';

const UNAVAILABLE_STATE = { unavailable: true } as const;

export interface PinnedBodyProps {
  readonly view: HomeMapStageView;
  readonly map: HomeMap;
  readonly scene: RenderScene;
  readonly floor: RenderFloor;
  readonly name: string;
  readonly dimmed: boolean;
  readonly context: StageContext;
  readonly live: StageLiveProps;
  readonly realistic: HeroRealistic | undefined;
  readonly onSelect: (selection: HomeMapSelection) => void;
}

type StillProps = Pick<PinnedBodyProps, 'floor' | 'name' | 'context' | 'live'> & {
  readonly rooms: readonly string[];
};

type FeedProps = Pick<PinnedBodyProps, 'map' | 'floor' | 'name' | 'context' | 'live'>;

function usePinnedLook(): HomeMapLookPref {
  return useStoreSelector((state) => prefValueOf(state, PREFS.homeMapLook), sameJson);
}

function usePinnedFeed(
  { map, floor, name, context, live }: FeedProps,
  look: HomeMapLookPref,
): HomeMapLive {
  const { focus } = context;
  const selectedDeviceId = focus.kind === 'device' ? focus.deviceId : null;
  const request = useMemo(
    () => ({ mapName: name, selectedDeviceId, animate: live.active }),
    [name, selectedDeviceId, live.active],
  );
  return useHomeMapLive(map, floor, look, request);
}

function PinnedStill({ floor, name, context, live, rooms }: StillProps): ReactNode {
  return (
    <View className="absolute inset-0" onLayout={live.onReady}>
      <StageStillView
        input={{ floor, activeRoomIds: rooms }}
        name={name}
        state={UNAVAILABLE_STATE}
        transparent={context.variant === 'pinned'}
      />
    </View>
  );
}

interface PinnedMap3dInput {
  readonly props: PinnedBodyProps;
  readonly rooms: readonly string[];
  readonly look: HomeMapLookPref;
  readonly feed: HomeMapLive;
}

function pinnedMap3d({ props, rooms, look, feed }: PinnedMap3dInput): HomeMap3dProps {
  const { scene, floor, context, live, onSelect } = props;
  const { focus } = context;
  return {
    scene,
    floor,
    view3d: context.view3d,
    chrome: context.chrome,
    insets: context.chromeInsets,
    label: feed.summary,
    selection: rooms,
    selectedItem: focus.kind === 'device' ? deviceKey(focus.deviceId) : null,
    look,
    live,
    feed,
    fallback: <PinnedStill {...props} rooms={rooms} />,
    realistic: null,
    onPickRoom: (roomId): void => {
      if (roomId === null) return;
      const selection = selectionOfHit(floor, { kind: 'room', id: roomId });
      if (selection !== null) onSelect(selection);
    },
    onPickDevice: (deviceId): void => {
      const selection = selectionOfHit(floor, { kind: 'device', id: deviceId });
      if (selection !== null) onSelect(selection);
    },
  };
}

function ViewBody(props: PinnedBodyProps): ReactNode {
  const { view, map, floor, context, realistic } = props;
  const rooms = useMemo(() => selectedRooms(floor, context.focus), [floor, context.focus]);
  const look = usePinnedLook();
  const feed = usePinnedFeed(props, look);
  const map3d = pinnedMap3d({ props, rooms, look, feed });
  if (view === 'realistic' && realistic !== undefined) return realistic({ map, map3d });
  return <HomeMap3d {...map3d} />;
}

export function PinnedBody(props: PinnedBodyProps): ReactNode {
  return (
    <View className={cn('absolute inset-0', props.dimmed && 'opacity-60')}>
      <ViewBody {...props} />
    </View>
  );
}
