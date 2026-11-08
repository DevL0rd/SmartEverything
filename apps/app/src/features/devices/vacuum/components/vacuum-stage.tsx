import { useEffect, useEffectEvent, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { VacuumScene } from '@smarteverything/domain';
import { href } from '../../../../app-shell/hrefs';
import { cn } from '../../../../design/cn';
import { PREFS, prefValueOf } from '../../../../store/prefs';
import { sameJson } from '../../../../store/same-json';
import { useStoreSelector } from '../../../../store/store-context';
import { useVacuumPose } from '../data/use-vacuum-pose';
import type { StageInsets } from '../../../../components/house-map/stage-fit';
import type { StageLiveProps } from '../../../../components/house-map/live-visibility/stage-host';
import {
  HomeMap3d,
  Stage,
  useHomeMapLive,
  type StageContent,
  type StageContext,
  type StagePill,
  type StageToolset,
  type StageVariant,
  type StageViewOption,
} from '../../../home-map';
import { valueOrNull } from '../model/readings';
import { roomAt } from '../model/room-at';
import type { RoomSelection } from '../model/room-selection';
import { houseSelection, unifiedPick, type UnifiedMap } from '../model/unified-map';
import { roomPick } from '../model/vacuum-scene';
import { Map3dView } from './map-3d-view';
import {
  VIEW_ICONS,
  VIEW_LABELS,
  VIEW_SPOKEN,
  describeUnifiedMap,
  describeVacuumMap,
  type StagePlan,
  type StageView,
} from './map-view-model';
import {
  NoteStack,
  StateCard,
  VacuumStill,
  type CardHandlers,
  type NoteHandlers,
} from './map-view-parts';

export interface StageHandlers extends CardHandlers, NoteHandlers {
  readonly onPickRoom: ((roomId: number | null) => void) | undefined;
  readonly onNoWebgl: () => void;
}

const FACE_INSET: StageInsets = { top: 8, bottom: 8 };

const FACE_CHIP_INSET: StageInsets = { top: 8, bottom: 56 };

export function stageInsets(context: StageContext, reserveBottom: boolean): StageInsets {
  if (context.variant !== 'face') return context.chromeInsets;
  return reserveBottom ? FACE_CHIP_INSET : FACE_INSET;
}

interface SceneProps {
  readonly deviceId: string;
  readonly scene: VacuumScene;
  readonly status: string | null;
  readonly selection: RoomSelection;
  readonly handlers: StageHandlers;
  readonly context: StageContext;
  readonly insets: StageInsets;
  readonly still: ReactNode;
}

interface RobotProps extends SceneProps {
  readonly turretRaised: number;
}

function Robot3d({ turretRaised, context, insets, still, ...rest }: RobotProps): ReactNode {
  const { deviceId, scene, status, selection, handlers } = rest;
  const pose = valueOrNull(useVacuumPose(deviceId)) ?? scene.robot;
  const currentRoomId = roomAt(scene.rooms, pose);
  return (
    <Map3dView
      deviceId={deviceId}
      scene={scene}
      turretRaised={turretRaised}
      preset={context.view3d.preset}
      fitSeq={context.view3d.fitSeq}
      follow={context.view3d.follow}
      selection={selection}
      currentRoomId={currentRoomId}
      keepOut={context.chrome}
      insets={insets}
      label={describeVacuumMap(scene, currentRoomId, status)}
      onPickRoom={(roomId): void => {
        handlers.onPickRoom?.(roomId);
      }}
      onUnavailable={handlers.onNoWebgl}
      fallback={still}
    />
  );
}

function NoWebgl({
  onShown,
  children,
}: {
  readonly onShown: () => void;
  readonly children: ReactNode;
}): ReactNode {
  const shown = useEffectEvent(onShown);
  useEffect(() => {
    shown();
  }, []);
  return children;
}

interface HouseProps extends SceneProps {
  readonly unified: UnifiedMap;
  readonly host: StageLiveProps;
}

function House3d({ unified, host, context, insets, still, ...rest }: HouseProps): ReactNode {
  const { deviceId, scene, status, selection, handlers } = rest;
  const router = useRouter();
  const look = useStoreSelector((state) => prefValueOf(state, PREFS.homeMapLook), sameJson);
  const mapName = unified.place.map.name;
  const request = useMemo(() => ({ mapName, animate: host.active }), [mapName, host.active]);
  const feed = useHomeMapLive(unified.place.map, unified.floor, look, request);
  const pose = valueOrNull(useVacuumPose(deviceId)) ?? scene.robot;
  const label = describeUnifiedMap(unified, pose, roomAt(scene.rooms, pose), status);
  return (
    <HomeMap3d
      scene={unified.scene}
      floor={unified.floor}
      view3d={context.view3d}
      chrome={context.chrome}
      insets={insets}
      label={label}
      selection={houseSelection(unified.rooms, selection)}
      selectedItem={null}
      look={look}
      live={host}
      feed={feed}
      fallback={<NoWebgl onShown={handlers.onNoWebgl}>{still}</NoWebgl>}
      realistic={null}
      onPickRoom={(roomId): void => {
        handlers.onPickRoom?.(unifiedPick(unified.rooms, roomPick(roomId))?.id ?? null);
      }}
      onPickDevice={(id): void => {
        router.push(href.devicesSelection({ device: id }));
      }}
    />
  );
}

export interface StageLiveHost {
  readonly id: string;
  readonly covered: boolean;
}

export interface MapStageProps {
  readonly deviceId: string;
  readonly plan: StagePlan;
  readonly status: string | null;
  readonly selection: RoomSelection;
  readonly turretRaised: number;
  readonly camera: ReactNode;
  readonly handlers: StageHandlers;
  readonly onViewChange: (view: StageView) => void;
  readonly pill?: StagePill | null;
  readonly variant?: StageVariant;
  readonly reserveBottom?: boolean;
  readonly onLocate?: (() => void) | undefined;
  readonly onFullScreen?: (() => void) | undefined;
  readonly live?: StageLiveHost | undefined;
  readonly unified?: UnifiedMap | null;
  readonly className?: string | undefined;
}

interface MapBodyProps {
  readonly stage: MapStageProps;
  readonly scene: SceneProps;
  readonly host: StageLiveProps | undefined;
}

function MapBody({ stage, scene, host }: MapBodyProps): ReactNode {
  const unified = stage.unified ?? null;
  if (!stage.plan.live3d) {
    return scene.still;
  }
  if (unified !== null && host !== undefined) {
    return <House3d {...scene} unified={unified} host={host} />;
  }
  return <Robot3d {...scene} turretRaised={stage.turretRaised} />;
}

function stillOf(stage: MapStageProps, scene: VacuumScene): ReactNode {
  return <VacuumStill deviceId={stage.deviceId} scene={scene} unified={stage.unified ?? null} />;
}

interface BodyProps {
  readonly stage: MapStageProps;
  readonly context: StageContext;
  readonly host?: StageLiveProps | undefined;
}

function Body({ stage, context, host }: BodyProps): ReactNode {
  const { plan, camera, handlers } = stage;
  if (plan.view === 'camera') {
    return <View className="absolute inset-0">{camera}</View>;
  }
  if (plan.body !== 'map') {
    return <StateCard body={plan.body} handlers={handlers} compact={context.variant === 'face'} />;
  }
  const scene: SceneProps = {
    deviceId: stage.deviceId,
    scene: plan.scene,
    status: stage.status,
    selection: stage.selection,
    handlers,
    context,
    insets: stageInsets(context, stage.reserveBottom === true),
    still: stillOf(stage, plan.scene),
  };
  return (
    <View className={cn('absolute inset-0', plan.dimmed && 'opacity-60')} onLayout={host?.onReady}>
      <MapBody stage={stage} scene={scene} host={host} />
    </View>
  );
}

function toolsOf(props: MapStageProps): StageToolset | null {
  const { plan } = props;
  if (plan.view === 'camera') {
    return null;
  }
  if (!plan.live3d && props.onLocate === undefined && props.onFullScreen === undefined) {
    return null;
  }
  return {
    tools3d: plan.live3d,
    follow: plan.live3d && (props.unified ?? null) === null,
    onLocate: props.onLocate,
    onFullScreen: props.onFullScreen,
  };
}

function viewOptions(views: readonly StageView[]): readonly StageViewOption<StageView>[] {
  return views.map((view) => ({
    value: view,
    label: VIEW_LABELS[view],
    spoken: VIEW_SPOKEN[view],
    icon: VIEW_ICONS[view],
  }));
}

export function stageContentOf(props: MapStageProps): StageContent {
  const { plan, live } = props;
  if (live === undefined || plan.view === 'camera' || plan.body !== 'map') {
    return { kind: 'direct', render: (context) => <Body stage={props} context={context} /> };
  }
  return {
    kind: 'live',
    id: live.id,
    modalCovered: live.covered,
    still: stillOf(props, plan.scene),
    render: (context, host) => <Body stage={props} context={context} host={host} />,
  };
}

export function MapStage(props: MapStageProps): ReactNode {
  const { plan, variant = 'page' } = props;
  return (
    <Stage
      variant={variant}
      className={props.className}
      content={stageContentOf(props)}
      views={viewOptions(plan.views)}
      view={plan.view}
      onViewChange={props.onViewChange}
      tools={toolsOf(props)}
      pill={plan.view === 'camera' ? null : (props.pill ?? null)}
      notices={
        plan.notes.length > 0 ? <NoteStack notes={plan.notes} handlers={props.handlers} /> : null
      }
    />
  );
}
