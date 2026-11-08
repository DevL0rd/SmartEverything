import { useMemo, useState, type Dispatch, type ReactNode } from 'react';
import { HOME_MAP_FLOOR_WRITE, type HomeMapFloor, type VacuumScene } from '@smarteverything/domain';
import type { EditEvent } from '../../../../../components/house-map/3d/map-3d-edit-protocol';
import type { CameraPresetId } from '../../../../../components/house-map/3d/render-core-orbit';
import { VACUUM_FLOOR_ID } from '../../../../../components/house-map/adapters/vacuum-scene';
import type { StageLiveProps } from '../../../../../components/house-map/live-visibility/stage-host';
import { PREFS, prefValueOf } from '../../../../../store/prefs';
import { sameJson } from '../../../../../store/same-json';
import { useStoreSelector } from '../../../../../store/store-context';
import {
  HomeMap3d,
  Stage,
  useHomeMapLive,
  type StageContent,
  type StageContext,
  type StageViewOption,
} from '../../../../home-map';
import type { EditFloorFeed, EditSettled } from '../../../../home-map/components/stage/home-map-3d';
import { StageNoticeChip } from '../../../../home-map/editor/stage-notice';
import type { UnifiedMap } from '../../model/unified-map';
import { Map3dView } from '../map-3d-view';
import { VacuumStill } from '../map-view-parts';
import type { ZoneView } from './zone-frame';
import type { ZoneAction, ZoneState } from './zone-reducer';
import { zoneActionsOf, zoneNotice, zoneSceneOverlay } from './zone-scene';

const NO_VIEWS: readonly StageViewOption<'3d'>[] = [];

const NO_ROOMS: readonly number[] = [];

const NO_ROOM_IDS: readonly string[] = [];

const ignore = (): void => undefined;

const LABEL = 'Map for editing zones';

export interface ZoneStageProps {
  readonly deviceId: string;
  readonly scene: VacuumScene;
  readonly view: ZoneView;
  readonly state: ZoneState;
  readonly dispatch: Dispatch<ZoneAction>;
  readonly unified: UnifiedMap | null;
}

function robotFloor(scene: VacuumScene): HomeMapFloor {
  return HOME_MAP_FLOOR_WRITE.parse({
    ...{ id: VACUUM_FLOOR_ID, name: scene.name ?? 'Robot map', level: 0, elevation: 0 },
    ...{ rooms: [], walls: [], openings: [], objects: [], placements: [], annotations: [] },
  });
}

function editFloorOf(
  unified: UnifiedMap | null,
  scene: VacuumScene,
  committed: number | null,
): EditFloorFeed | null {
  const floor =
    unified === null
      ? robotFloor(scene)
      : unified.place.map.floors.find((item) => item.id === unified.floor.id);
  if (floor === undefined) return null;
  return { key: `zones:${floor.id}:${String(committed)}`, wire: { floor, boxes: {} }, committed };
}

interface ZoneEditing {
  readonly floor: EditFloorFeed | null;
  readonly overlay: ReturnType<typeof zoneSceneOverlay>;
  readonly settled: EditSettled | null;
  readonly onEvent: (event: EditEvent) => void;
}

function useZoneEditing(props: ZoneStageProps): ZoneEditing {
  const { state, view, scene, dispatch, deviceId, unified } = props;
  const [committed, setCommitted] = useState<number | null>(null);
  const [settled, setSettled] = useState<EditSettled | null>(null);
  const { present, selected } = state;
  const overlay = useMemo(
    () => zoneSceneOverlay({ draft: present, selected, view, frameKey: `zones:${deviceId}` }),
    [present, selected, view, deviceId],
  );
  const floor = useMemo(() => editFloorOf(unified, scene, committed), [unified, scene, committed]);
  const onEvent = (event: EditEvent): void => {
    const actions = zoneActionsOf({ draft: present, selected, view, bounds: scene.bounds }, event);
    actions.forEach(dispatch);
    if (event.type !== 'vertex') return;
    if (actions.length === 0) setSettled({ seq: event.seq, accepted: false });
    else setCommitted(event.seq);
  };
  return { floor, overlay, settled, onEvent };
}

interface SceneProps {
  readonly stage: ZoneStageProps;
  readonly editing: ZoneEditing;
  readonly context: StageContext;
}

function RobotScene({ stage, editing, context }: SceneProps): ReactNode {
  const { floor } = editing;
  return (
    <Map3dView
      deviceId={stage.deviceId}
      scene={stage.scene}
      turretRaised={0}
      preset={context.view3d.preset}
      fitSeq={context.view3d.fitSeq}
      selection={NO_ROOMS}
      currentRoomId={null}
      keepOut={context.chrome}
      insets={context.chromeInsets}
      label={LABEL}
      fallback={<VacuumStill deviceId={stage.deviceId} scene={stage.scene} unified={null} />}
      {...(floor === null ? {} : { edit: { ...editing, floor } })}
      onPickRoom={ignore}
      onUnavailable={ignore}
    />
  );
}

interface HouseSceneProps extends SceneProps {
  readonly unified: UnifiedMap;
  readonly live: StageLiveProps;
}

function HouseScene({ stage, editing, context, unified, live }: HouseSceneProps): ReactNode {
  const look = useStoreSelector((state) => prefValueOf(state, PREFS.homeMapLook), sameJson);
  const mapName = unified.place.map.name;
  const request = useMemo(() => ({ mapName, animate: live.active }), [mapName, live.active]);
  const feed = useHomeMapLive(unified.place.map, unified.floor, look, request);
  const still = <VacuumStill deviceId={stage.deviceId} scene={stage.scene} unified={unified} />;
  return (
    <HomeMap3d
      {...{ scene: unified.scene, floor: unified.floor, view3d: context.view3d }}
      {...{ chrome: context.chrome, insets: context.chromeInsets, label: LABEL, look, live, feed }}
      selection={NO_ROOM_IDS}
      selectedItem={null}
      realistic={null}
      fallback={still}
      onPickRoom={ignore}
      onPickDevice={ignore}
      edit={{ ...editing, onUnavailable: ignore }}
    />
  );
}

function contentOf(stage: ZoneStageProps, editing: ZoneEditing): StageContent {
  const { unified } = stage;
  if (unified === null) {
    return {
      kind: 'direct',
      render: (context) => <RobotScene stage={stage} editing={editing} context={context} />,
    };
  }
  return {
    kind: 'live',
    id: `vacuum-zones.${stage.deviceId}`,
    still: <VacuumStill deviceId={stage.deviceId} scene={stage.scene} unified={unified} />,
    render: (context, live) => <HouseScene {...{ stage, editing, context, unified, live }} />,
  };
}

export function ZoneStage(props: ZoneStageProps): ReactNode {
  const [preset, setPreset] = useState<CameraPresetId>('top');
  const editing = useZoneEditing(props);
  const { present, selected } = props.state;
  return (
    <Stage
      variant="page"
      className="border-hairline border-outline-variant"
      summary={LABEL}
      content={contentOf(props, editing)}
      views={NO_VIEWS}
      view="3d"
      onViewChange={ignore}
      tools={{ tools3d: true }}
      camera={{ preset, onPreset: setPreset }}
      notices={<StageNoticeChip notice={zoneNotice(present, selected)} />}
    />
  );
}
