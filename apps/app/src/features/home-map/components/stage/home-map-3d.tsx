import { useEffect, useState, type ReactNode } from 'react';
import { useUniwind } from 'uniwind';
import { DEFAULT_VACUUM_FINISH, type HomeMap } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import Map3d from '../../../../components/house-map/3d/map-3d';
import {
  HandleSlot,
  Map3dBridge,
  type BridgeLive,
} from '../../../../components/house-map/3d/map-3d-bridge';
import {
  EDIT_EVENT,
  type EditEvent,
  type EditFloorWire,
  type EditOverlay,
} from '../../../../components/house-map/3d/map-3d-edit-protocol';
import { createFailureReporter } from '../../../../components/house-map/3d/map-3d-failures';
import type {
  Map3dFailure,
  ScanPlacementWire,
  ScanSource,
} from '../../../../components/house-map/3d/map-3d-protocol';
import type { ObjectLook } from '../../../../components/house-map/3d/render-core-objects';
import type { ChromeBox, StageInsets } from '../../../../components/house-map/stage-fit';
import type { StageLiveProps } from '../../../../components/house-map/live-visibility/stage-host';
import type { RenderFloor, RenderScene } from '../../../../components/house-map/render-scene';
import { useMotion } from '../../../../design/motion';
import { useStableCallback } from '../../../../design/use-stable-callback';
import { useSceneModels } from '../../../models';
import type { View3d } from './stage';

const log = new Logger('app.home-map');

const report = createFailureReporter(log);

const FILL = { flex: 1 } as const;

const NO_ROOMS: readonly string[] = [];

interface Channel {
  readonly generation: number;
  readonly handle: HandleSlot;
  readonly bridge: Map3dBridge;
}

function createChannel(generation: number): Channel {
  const handle = new HandleSlot();
  return { generation, handle, bridge: new Map3dBridge(() => handle.current) };
}

export interface HomeMap3dScan {
  readonly source: ScanSource | null;
  readonly placement: ScanPlacementWire | null;
  readonly retrySeq: number;
  readonly onFailed: (detail: string) => void;
}

export interface EditFloorFeed {
  readonly key: string;
  readonly wire: EditFloorWire;
  readonly committed: number | null;
}

export interface EditSettled {
  readonly seq: number;
  readonly accepted: boolean;
}

export interface HomeMap3dEdit {
  readonly floor: EditFloorFeed | null;
  readonly overlay: EditOverlay | null;
  readonly settled: EditSettled | null;
  readonly onEvent: (event: EditEvent) => void;
  readonly onUnavailable: () => void;
}

export interface HomeMap3dProps {
  readonly scene: RenderScene;
  readonly floor: RenderFloor;
  readonly view3d: View3d;
  readonly chrome: readonly ChromeBox[];
  readonly insets: StageInsets;
  readonly label: string;
  readonly selection: readonly string[];
  readonly frameRooms?: readonly string[] | undefined;
  readonly selectedItem: string | null;
  readonly look: ObjectLook;
  readonly live: StageLiveProps;
  readonly feed: BridgeLive;
  readonly fallback: ReactNode;
  readonly realistic: HomeMap3dScan | null;
  readonly onPickRoom: (roomId: string | null) => void;
  readonly onPickDevice: (deviceId: string) => void;
  readonly edit?: HomeMap3dEdit | undefined;
}

export interface HeroRealisticInput {
  readonly map: HomeMap;
  readonly map3d: HomeMap3dProps;
}

export type HeroRealistic = (input: HeroRealisticInput) => ReactNode;

interface Wiring {
  readonly channel: Channel;
  readonly unavailable: boolean;
  readonly ready: () => Promise<void>;
  readonly failed: (failure: Map3dFailure, detail: string) => Promise<void>;
  readonly lost: (cause: string) => void;
}

function useScanWiring(bridge: Map3dBridge, realistic: HomeMap3dScan | null): void {
  const source = realistic?.source ?? null;
  const placement = realistic?.placement ?? null;
  const retrySeq = realistic?.retrySeq ?? 0;
  useEffect(() => {
    bridge.setScan(source, placement);
  }, [bridge, source, placement]);
  useEffect(() => {
    if (retrySeq > 0) bridge.retryScan();
  }, [bridge, retrySeq]);
}

function useSceneWiring(bridge: Map3dBridge, { scene, floor, edit }: HomeMap3dProps): void {
  const editFloor = edit?.floor ?? null;
  const overlay = edit?.overlay ?? null;
  const settled = edit?.settled ?? null;
  useEffect(() => {
    bridge.setScene(scene, floor);
    if (editFloor !== null) {
      bridge.setEditFloor(editFloor.key, editFloor.wire, editFloor.committed);
    }
  }, [bridge, scene, floor, editFloor]);
  useEffect(() => {
    bridge.setEdit(overlay);
  }, [bridge, overlay]);
  useEffect(() => {
    if (settled !== null) bridge.editResult(settled.seq, settled.accepted);
  }, [bridge, settled]);
}

function useWiring(props: HomeMap3dProps, onReady: () => void): Wiring {
  const { floor, feed, realistic } = props;
  const [channel, setChannel] = useState(() => createChannel(0));
  const [unavailable, setUnavailable] = useState(false);
  const { bridge } = channel;
  useScanWiring(bridge, realistic);
  const models = useSceneModels(floor);
  useEffect(() => {
    bridge.setModels(models);
  }, [bridge, models]);
  useSceneWiring(bridge, props);
  useEffect(() => {
    bridge.setLive(feed);
  }, [bridge, feed]);
  const ready = useStableCallback((): Promise<void> => {
    bridge.ready();
    onReady();
    return Promise.resolve();
  });
  const failed = useStableCallback((failure: Map3dFailure, detail: string): Promise<void> => {
    report(failure, detail);
    setUnavailable(true);
    props.edit?.onUnavailable();
    return Promise.resolve();
  });
  const lost = useStableCallback((cause: string): void => {
    log.warn('hero.map3d_webview_lost', { cause });
    bridge.lost();
    setChannel((current) => createChannel(current.generation + 1));
  });
  return { channel, unavailable, ready, failed, lost };
}

interface SurfaceProps {
  readonly slot: HandleSlot;
  readonly generation: number;
  readonly stage: HomeMap3dProps;
  readonly wiring: Pick<Wiring, 'ready' | 'failed' | 'lost'>;
  readonly onPickRoom: (roomId: string | null) => Promise<void>;
  readonly onPickDevice: (deviceId: string) => Promise<void>;
  readonly onScanFailed: (detail: string) => Promise<void>;
  readonly onEdit: (json: string) => Promise<void>;
}

function Surface(props: SurfaceProps): ReactNode {
  const { slot, generation, stage, wiring, onPickRoom, onPickDevice, onScanFailed } = props;
  const editing = stage.edit === undefined ? {} : { editing: true, onEdit: props.onEdit };
  const theme = useUniwind().theme === 'light' ? 'light' : 'dark';
  const { reduced } = useMotion();
  const { showFurniture, showDeviceModels } = stage.look;
  return (
    <Map3d
      key={generation}
      ref={slot}
      theme={theme}
      finish={DEFAULT_VACUUM_FINISH}
      preset={stage.view3d.preset}
      active={stage.live.active}
      reducedMotion={reduced}
      fitSeq={stage.view3d.fitSeq}
      follow={false}
      selection={stage.selection}
      frameRooms={stage.frameRooms ?? NO_ROOMS}
      selectedItem={stage.selectedItem}
      quality={stage.live.quality}
      realistic={stage.realistic !== null}
      objectLook={{ showFurniture, showDeviceModels }}
      currentRoomId={null}
      keepOut={stage.chrome}
      insets={stage.insets}
      label={stage.label}
      onReady={wiring.ready}
      onPickRoom={onPickRoom}
      onPickDevice={onPickDevice}
      onUnavailable={wiring.failed}
      onScanFailed={onScanFailed}
      {...editing}
      onFrameTime={(frameMs) => {
        stage.live.onFrameTime(frameMs);
        return Promise.resolve();
      }}
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

export function HomeMap3d(props: HomeMap3dProps): ReactNode {
  const wiring = useWiring(props, props.live.onReady);
  const picked = useStableCallback((roomId: string | null): Promise<void> => {
    props.onPickRoom(roomId);
    return Promise.resolve();
  });
  const pickedDevice = useStableCallback((deviceId: string): Promise<void> => {
    props.onPickDevice(deviceId);
    return Promise.resolve();
  });
  const scanFailed = useStableCallback((detail: string): Promise<void> => {
    props.realistic?.onFailed(detail);
    return Promise.resolve();
  });
  const edited = useStableCallback((json: string): Promise<void> => {
    props.edit?.onEvent(EDIT_EVENT.parse(JSON.parse(json)));
    return Promise.resolve();
  });
  if (wiring.unavailable) return props.fallback;
  const { channel } = wiring;
  return (
    <Surface
      slot={channel.handle}
      generation={channel.generation}
      stage={props}
      wiring={wiring}
      onPickRoom={picked}
      onPickDevice={pickedDevice}
      onScanFailed={scanFailed}
      onEdit={edited}
    />
  );
}
