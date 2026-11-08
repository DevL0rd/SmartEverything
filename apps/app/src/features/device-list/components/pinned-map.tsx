import { useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import type { HomeMap, HomeMapSummary } from '@smarteverything/domain';
import type { RenderFloor, RenderScene } from '../../../components/house-map/render-scene';
import { PREFS, prefValueOf } from '../../../store/prefs';
import { sameJson } from '../../../store/same-json';
import { useSyncStatus } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import {
  EmptyFloorRow,
  type HomeMapSelection,
  Stage,
  type StageContent,
  stageDimmed,
  type StageFloors,
  StageFullScreen,
  stageIdOf,
  type StageMaps,
  stageNotices,
  stageNoticesNode,
  stagePhase,
  type StagePhase,
  StageSkeleton,
  StageStillView,
  type StageViews,
  useHomeMap,
  useHomeMapDemand,
  useHomeMapScene,
  useHomeMapSet,
  type HeroRealistic,
  useLastFloor,
  useMapChoice,
  useStageLights,
  useStageMaps,
  useStageViews,
} from '../../home-map';
import { selectedRooms } from '../model/map-pick';
import { PinnedBody } from './pinned-body';

const EDITOR = '/home-map/edit';

const PAGE = 'devices';

const NO_STATE = { unavailable: false } as const;

export interface PinnedMapProps {
  readonly focus: HomeMapSelection;
  readonly onSelect: (selection: HomeMapSelection) => void;
  readonly realistic?: HeroRealistic | undefined;
}

function floorsOf(
  scene: RenderScene,
  value: string,
  onChange: (id: string) => void,
): StageFloors | undefined {
  if (scene.floors.length < 2) return undefined;
  return {
    options: scene.floors.map((floor) => ({ id: floor.id, label: floor.name })),
    value,
    onChange,
  };
}

interface Shown {
  readonly map: HomeMap | null;
  readonly scene: RenderScene | null;
  readonly floor: RenderFloor | null;
  readonly phase: StagePhase;
}

interface FrameProps extends PinnedMapProps {
  readonly name: string;
  readonly connected: boolean;
  readonly loadFailed: boolean;
  readonly retry: () => void;
  readonly views: StageViews;
  readonly maps: StageMaps | undefined;
}

interface ContentInput {
  readonly frame: FrameProps;
  readonly shown: Shown;
  readonly full: boolean;
  readonly covered: boolean;
  readonly onEdit: () => void;
}

function contentOf({ frame, shown, full, covered, onEdit }: ContentInput): StageContent {
  const { map, scene, floor, phase } = shown;
  if (phase !== 'map' || map === null || scene === null || floor === null) {
    return {
      kind: 'direct',
      render: (): ReactNode =>
        phase === 'empty-floor' ? (
          <EmptyFloorRow floorName={floor?.name ?? null} onDrawRooms={onEdit} />
        ) : (
          <StageSkeleton />
        ),
    };
  }
  return {
    kind: 'live',
    id: stageIdOf({ kind: full ? 'devices-full-screen' : 'devices-pinned' }),
    modalCovered: covered,
    still: (
      <StageStillView
        input={{ floor, activeRoomIds: selectedRooms(floor, frame.focus) }}
        name={frame.name}
        state={NO_STATE}
        transparent={!full}
      />
    ),
    render: (context, live) => (
      <PinnedBody
        view={frame.views.view}
        map={map}
        scene={scene}
        floor={floor}
        name={frame.name}
        dimmed={stageDimmed(phase, frame.connected)}
        context={context}
        live={live}
        realistic={frame.realistic}
        onSelect={frame.onSelect}
      />
    ),
  };
}

interface FramedProps extends FrameProps {
  readonly shown: Shown;
  readonly floors?: StageFloors | undefined;
}

interface FramedStageProps extends FramedProps {
  readonly full: boolean;
  readonly covered: boolean;
  readonly onFullScreen: (() => void) | undefined;
}

function FramedStage({
  shown,
  floors,
  full,
  covered,
  onFullScreen,
  ...frame
}: FramedStageProps): ReactNode {
  const router = useRouter();
  const lights = useStageLights();
  const onEdit = (): void => {
    router.push(EDITOR);
  };
  const facts = {
    phase: shown.phase,
    connected: frame.connected,
    loadFailed: frame.loadFailed,
    crashed: false,
  };
  const notices = stageNotices(
    { ...facts, leaseFailed: false, madeFromRobot: false, mapNotices: [] },
    { onEdit, onRetryLoad: frame.retry },
  );
  const frameClass = shown.phase === 'map' ? 'rounded-none bg-transparent!' : 'rounded-none';
  return (
    <Stage
      variant={full ? 'full' : 'pinned'}
      className={full ? undefined : frameClass}
      focus={frame.focus}
      views={frame.views.views}
      view={frame.views.view}
      onViewChange={frame.views.setView}
      tools={{ tools3d: frame.views.view === '3d', lights, onFullScreen, onEdit }}
      floors={floors}
      maps={frame.maps}
      notices={stageNoticesNode(notices)}
      content={contentOf({ frame, shown, full, covered, onEdit })}
    />
  );
}

function Framed(props: FramedProps): ReactNode {
  const [full, setFull] = useState(false);
  const close = (): void => {
    setFull(false);
  };
  return (
    <>
      <FramedStage
        {...props}
        full={false}
        covered={full}
        onFullScreen={(): void => {
          setFull(true);
        }}
      />
      {full ? (
        <StageFullScreen title={props.name} onClose={close}>
          <FramedStage {...props} full covered={false} onFullScreen={undefined} />
        </StageFullScreen>
      ) : null}
    </>
  );
}

interface LoadedStageProps extends FrameProps {
  readonly map: HomeMap;
  readonly scene: RenderScene;
}

function LoadedStage({ map, scene, ...props }: LoadedStageProps): ReactNode {
  const { floorId, setFloor } = useLastFloor();
  const floor = scene.floors.find((item) => item.id === floorId) ?? scene.floors[0] ?? null;
  return (
    <Framed
      {...props}
      shown={{ map, scene, floor, phase: stagePhase({ hasMap: true, loading: false, floor }) }}
      floors={floorsOf(scene, floor?.id ?? '', setFloor)}
    />
  );
}

function MapStage({
  summary,
  ...props
}: PinnedMapProps & { readonly summary: HomeMapSummary }): ReactNode {
  const state = useHomeMap(summary.id);
  const scene = useHomeMapScene(state.map);
  const look = useStoreSelector((store) => prefValueOf(store, PREFS.homeMapLook), sameJson);
  useHomeMapDemand(PAGE, state.map, look);
  const maps = useStageMaps(PAGE, summary.id);
  const connected = useSyncStatus().status === 'live';
  const views = useStageViews(PAGE, {
    hasScan: summary.hasScan && props.realistic !== undefined,
  });
  const loadFailed = state.failure !== null;
  const frame = {
    ...props,
    name: summary.name,
    connected,
    loadFailed,
    retry: state.retry,
    views,
    maps,
  };
  if (state.map !== null && scene !== null) {
    return <LoadedStage {...frame} map={state.map} scene={scene} />;
  }
  const phase = stagePhase({ hasMap: false, loading: state.loading || loadFailed, floor: null });
  return <Framed {...frame} shown={{ map: null, scene: null, floor: null, phase }} />;
}

export type PinnedChoice =
  | { readonly kind: 'loading' }
  | { readonly kind: 'blank'; readonly map: HomeMapSummary | null }
  | { readonly kind: 'map'; readonly map: HomeMapSummary };

export function pinnedChoiceOf(map: HomeMapSummary | null, ready: boolean): PinnedChoice {
  if (map !== null) return map.roomCount === 0 ? { kind: 'blank', map } : { kind: 'map', map };
  return ready ? { kind: 'blank', map: null } : { kind: 'loading' };
}

export function usePinnedChoice(): PinnedChoice {
  const set = useHomeMapSet();
  const choice = useMapChoice('devices', set.maps);
  return pinnedChoiceOf(choice.map, choice.ready);
}

export function PinnedMap({
  summary,
  ...props
}: PinnedMapProps & { readonly summary: HomeMapSummary | null }): ReactNode {
  if (summary === null) return <StageSkeleton />;
  return <MapStage {...props} summary={summary} />;
}
