import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useUniwind } from 'uniwind';
import type {
  VacuumFinish,
  VacuumPose,
  VacuumScene,
  VacuumTrailRun,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { useScreenLive } from '../../../../design/animation-gate';
import { useMotion } from '../../../../design/motion';
import { useStableCallback } from '../../../../design/use-stable-callback';
import { useOnScreen } from '../../../../design/visibility';
import { useVacuumFinish } from '../../../device-visuals';
import { useLiveTrail } from '../data/use-live-trail';
import { useVacuumPose } from '../data/use-vacuum-pose';
import { valueOrNull } from '../model/readings';
import { roomPick, vacuumHit, vacuumRoomRenderId } from '../model/vacuum-scene';
import { vacuumRenderScene } from '../../../../components/house-map/adapters/vacuum-scene';
import type { RenderFloor, RenderScene } from '../../../../components/house-map/render-scene';
import Map3d from '../../../../components/house-map/3d/map-3d';
import { HandleSlot, Map3dBridge } from '../../../../components/house-map/3d/map-3d-bridge';
import { createFailureReporter } from '../../../../components/house-map/3d/map-3d-failures';
import type { Map3dFailure } from '../../../../components/house-map/3d/map-3d-protocol';
import {
  EDIT_EVENT,
  type EditEvent,
  type EditOverlay,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { EditFloorFeed, EditSettled } from '../../../home-map/components/stage/home-map-3d';
import type {
  CameraPresetId,
  ViewInsets,
} from '../../../../components/house-map/3d/render-core-orbit';
import type { ChromeBox } from '../../../../components/house-map/stage-fit';

const log = new Logger('app.devices');

const report = createFailureReporter(log);

const FILL = { flex: 1 } as const;

const NO_RUNS: readonly VacuumTrailRun[] = [];

export interface Map3dTrack {
  readonly trail: readonly VacuumTrailRun[];
  readonly pose: VacuumPose | null;
}

export interface Map3dViewEdit {
  readonly floor: EditFloorFeed;
  readonly overlay: EditOverlay;
  readonly settled: EditSettled | null;
  readonly onEvent: (event: EditEvent) => void;
}

export interface Map3dViewProps {
  readonly deviceId: string;
  readonly scene: VacuumScene;
  readonly turretRaised: number;
  readonly preset: CameraPresetId;
  readonly fitSeq?: number;
  readonly follow?: boolean;
  readonly selection: readonly number[];
  readonly currentRoomId: number | null;
  readonly keepOut?: readonly ChromeBox[];
  readonly insets: ViewInsets;
  readonly label: string;
  readonly fallback: ReactNode;
  readonly track?: Map3dTrack;
  readonly edit?: Map3dViewEdit;
  readonly onPickRoom: (roomId: number | null) => void;
  readonly onUnavailable: () => void;
}

interface Channel {
  readonly generation: number;
  readonly handle: HandleSlot;
  readonly bridge: Map3dBridge;
}

function createChannel(generation: number): Channel {
  const handle = new HandleSlot();
  return { generation, handle, bridge: new Map3dBridge(() => handle.current) };
}

interface Wiring {
  readonly channel: Channel;
  readonly unavailable: boolean;
  readonly ready: () => Promise<void>;
  readonly failed: (failure: Map3dFailure, detail: string) => Promise<void>;
  readonly lost: (cause: string) => void;
}

interface Rendered {
  readonly scene: RenderScene;
  readonly floor: RenderFloor;
}

function renderedOf(scene: VacuumScene): Rendered {
  const rendered = vacuumRenderScene({ scene });
  const [floor] = rendered.floors;
  if (floor === undefined) throw new Error('The vacuum render scene has no floor');
  return { scene: rendered, floor };
}

function renderIds(scene: VacuumScene, floor: RenderFloor, ids: readonly number[]): string[] {
  return ids.flatMap((id) => {
    const renderId = vacuumRoomRenderId(scene, floor, id);
    return renderId === null ? [] : [renderId];
  });
}

function vacuumRoomOf(
  scene: VacuumScene,
  floor: RenderFloor,
  roomId: string | null,
): number | null {
  return vacuumHit(scene, floor, roomPick(roomId))?.id ?? null;
}

function useWiring(rendered: Rendered, onUnavailable: () => void): Wiring {
  const [channel, setChannel] = useState(() => createChannel(0));
  const [unavailable, setUnavailable] = useState(false);
  const { bridge } = channel;
  useEffect(() => {
    bridge.setScene(rendered.scene, rendered.floor);
  }, [bridge, rendered]);
  const ready = useStableCallback((): Promise<void> => {
    bridge.ready();
    return Promise.resolve();
  });
  const failed = useStableCallback((failure: Map3dFailure, detail: string): Promise<void> => {
    report(failure, detail);
    setUnavailable(true);
    onUnavailable();
    return Promise.resolve();
  });
  const lost = useStableCallback((cause: string): void => {
    log.warn('vacuum.map3d_webview_lost', { cause });
    bridge.lost();
    setChannel((current) => createChannel(current.generation + 1));
  });
  return { channel, unavailable, ready, failed, lost };
}

function PoseFeed({
  deviceId,
  turretRaised,
  bridge,
}: {
  readonly deviceId: string;
  readonly turretRaised: number;
  readonly bridge: Map3dBridge;
}): null {
  const pose = valueOrNull(useVacuumPose(deviceId));
  useEffect(() => {
    bridge.setPose(pose, turretRaised);
  }, [bridge, pose, turretRaised]);
  return null;
}

function TrailFeed({
  deviceId,
  base,
  bridge,
}: {
  readonly deviceId: string;
  readonly base: readonly VacuumTrailRun[];
  readonly bridge: Map3dBridge;
}): null {
  const trail = useLiveTrail(deviceId, base);
  useEffect(() => {
    bridge.setTrail(trail);
  }, [bridge, trail]);
  return null;
}

function TrackFeed({
  track,
  bridge,
}: {
  readonly track: Map3dTrack;
  readonly bridge: Map3dBridge;
}): null {
  useEffect(() => {
    bridge.setTrail({ base: NO_RUNS, live: track.trail });
    bridge.setPose(track.pose, 0);
  }, [bridge, track]);
  return null;
}

function Feeds({
  deviceId,
  scene,
  turretRaised,
  track,
  bridge,
}: {
  readonly deviceId: string;
  readonly scene: VacuumScene;
  readonly turretRaised: number;
  readonly track: Map3dTrack | undefined;
  readonly bridge: Map3dBridge;
}): ReactNode {
  if (track !== undefined) {
    return <TrackFeed track={track} bridge={bridge} />;
  }
  return (
    <>
      <TrailFeed deviceId={deviceId} base={scene.trail} bridge={bridge} />
      <PoseFeed deviceId={deviceId} turretRaised={turretRaised} bridge={bridge} />
    </>
  );
}

function EditFeed({
  edit,
  bridge,
}: {
  readonly edit: Map3dViewEdit;
  readonly bridge: Map3dBridge;
}): null {
  const { floor, overlay, settled } = edit;
  useEffect(() => {
    bridge.setEditFloor(floor.key, floor.wire, floor.committed);
  }, [bridge, floor]);
  useEffect(() => {
    bridge.setEdit(overlay);
  }, [bridge, overlay]);
  useEffect(() => {
    if (settled !== null) bridge.editResult(settled.seq, settled.accepted);
  }, [bridge, settled]);
  return null;
}

interface SurfaceProps {
  readonly slot: HandleSlot;
  readonly finish: VacuumFinish;
  readonly generation: number;
  readonly preset: CameraPresetId;
  readonly fitSeq: number;
  readonly follow: boolean;
  readonly selection: readonly string[];
  readonly currentRoomId: string | null;
  readonly keepOut: readonly ChromeBox[];
  readonly insets: ViewInsets;
  readonly label: string;
  readonly active: boolean;
  readonly wiring: Pick<Wiring, 'ready' | 'failed' | 'lost'>;
  readonly onPickRoom: (roomId: string | null) => Promise<void>;
  readonly onEdit: ((json: string) => Promise<void>) | undefined;
}

function Surface(props: SurfaceProps): ReactNode {
  const { slot, generation, preset, label, active, wiring, onPickRoom } = props;
  const { fitSeq, follow, selection, currentRoomId, onEdit } = props;
  const editing = onEdit === undefined ? {} : { editing: true, onEdit };
  const theme = useUniwind().theme === 'light' ? 'light' : 'dark';
  const { reduced } = useMotion();
  return (
    <Map3d
      key={generation}
      ref={slot}
      theme={theme}
      finish={props.finish}
      preset={preset}
      active={active}
      reducedMotion={reduced}
      fitSeq={fitSeq}
      follow={follow}
      selection={selection}
      currentRoomId={currentRoomId}
      keepOut={props.keepOut}
      insets={props.insets}
      label={label}
      onReady={wiring.ready}
      onPickRoom={onPickRoom}
      onUnavailable={wiring.failed}
      {...editing}
      dom={{
        style: FILL,
        onContentProcessDidTerminate: () => {
          wiring.lost('content_process_terminated');
        },
        onRenderProcessGone: () => {
          wiring.lost('render_process_gone');
        },
      }}
    />
  );
}

const NO_KEEP_OUT: readonly ChromeBox[] = [];

function useEdited(edit: Map3dViewEdit | undefined): (json: string) => Promise<void> {
  return useStableCallback((json: string): Promise<void> => {
    edit?.onEvent(EDIT_EVENT.parse(JSON.parse(json)));
    return Promise.resolve();
  });
}

export function Map3dView(props: Map3dViewProps): ReactNode {
  const { deviceId, scene, turretRaised, preset, label, fallback } = props;
  const frame = useRef<View>(null);
  const { visible, onLayout } = useOnScreen(frame);
  const { focused, foreground } = useScreenLive();
  const rendered = renderedOf(scene);
  const wiring = useWiring(rendered, props.onUnavailable);
  const picked = useStableCallback((roomId: string | null): Promise<void> => {
    props.onPickRoom(vacuumRoomOf(scene, rendered.floor, roomId));
    return Promise.resolve();
  });
  const edited = useEdited(props.edit);
  const { channel } = wiring;
  const finish = useVacuumFinish(deviceId);
  const active = visible && focused && foreground;
  if (wiring.unavailable) {
    return fallback;
  }
  return (
    <View ref={frame} onLayout={onLayout} collapsable={false} style={FILL}>
      <Surface
        slot={channel.handle}
        finish={finish}
        generation={channel.generation}
        preset={preset}
        fitSeq={props.fitSeq ?? 0}
        follow={props.follow === true}
        selection={renderIds(scene, rendered.floor, props.selection)}
        currentRoomId={vacuumRoomRenderId(scene, rendered.floor, props.currentRoomId)}
        keepOut={props.keepOut ?? NO_KEEP_OUT}
        insets={props.insets}
        label={label}
        active={active}
        wiring={wiring}
        onPickRoom={picked}
        onEdit={props.edit === undefined ? undefined : edited}
      />
      {props.edit === undefined ? null : <EditFeed edit={props.edit} bridge={channel.bridge} />}
      <Feeds
        deviceId={deviceId}
        scene={scene}
        turretRaised={turretRaised}
        track={props.track}
        bridge={channel.bridge}
      />
    </View>
  );
}
