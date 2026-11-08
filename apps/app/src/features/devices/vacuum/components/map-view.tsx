import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import type { JsonValue, VacuumScene } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { useOnScreen } from '../../../../design/visibility';
import { useSettings } from '../../../../store/selectors';
import type { Device } from '../../../../store/state';
import { parseMapVersion } from '../data/map-feed';
import { useVacuumScene } from '../data/scene-query';
import type { VacuumSnapshot } from '../data/snapshot';
import { useUnifiedMap } from '../data/use-unified-map';
import { useVacuum } from '../data/use-vacuum';
import type { UnifiedMap } from '../model/unified-map';
import { useLastSeen } from '../../model/last-seen';
import { vacuumChipOf, type VacuumChip } from '../model/phase-chip';
import { roomAt } from '../model/room-at';
import { useVacuumPose } from '../data/use-vacuum-pose';
import { stageIdOf, type StagePill, type StageVariant } from '../../../home-map';
import { stationPillOf } from '../model/phase-line';
import { readingOf, valueOrNull } from '../model/readings';
import { NO_SELECTION, type RoomSelection } from '../model/room-selection';
import { MapStage, type StageHandlers, type StageLiveHost } from './vacuum-stage';
import { useVacuumRoute } from './map-view-parts';
import { useVacuumLocate } from '../data/use-vacuum-actions';
import { VacuumCamera } from './vacuum-camera';
import {
  planStage,
  stageStatus,
  type StageFault,
  type StagePlan,
  type StageView,
} from './map-view-model';

const log = new Logger('app.devices');

interface Held {
  readonly deviceId: string;
  readonly scene: VacuumScene;
}

function useLastGoodScene(
  deviceId: string,
  scene: VacuumScene | null,
  mapExpected: boolean,
): VacuumScene | null {
  const [held, setHeld] = useState<Held | null>(null);
  if (scene !== null && (held?.scene !== scene || held.deviceId !== deviceId)) {
    setHeld({ deviceId, scene });
  }
  if (scene !== null) {
    return scene;
  }
  return mapExpected && held?.deviceId === deviceId ? held.scene : null;
}

export interface MapViewProps {
  readonly device: Device;
  readonly initialView?: StageView;
  readonly onViewChange?: (view: StageView) => void;
  readonly selection?: RoomSelection;
  readonly onPickRoom?: (roomId: number | null) => void;
  readonly onFullScreen?: () => void;
  readonly turretRaised?: number;
  readonly fault?: StageFault | null;
  readonly notAccepted?: string | null;
  readonly onMapHome?: () => void;
  readonly variant?: StageVariant;
  readonly reserveBottom?: boolean;
  readonly covered?: boolean;
  readonly onReady?: () => void;
  readonly onUnavailable?: () => void;
  readonly className?: string;
}

interface MapFeed {
  readonly scene: VacuumScene | null;
  readonly hasMapVersion: boolean;
  readonly problem: string | null;
  readonly retry: (() => void) | undefined;
}

function useMapFeed(deviceId: string, versionText: JsonValue | undefined): MapFeed {
  const version = readingOf(() => parseMapVersion(versionText));
  const map = valueOrNull(version);
  const state = useVacuumScene(deviceId, map);
  const scene = useLastGoodScene(deviceId, state.scene, map !== null || !version.ok);
  const problem = version.ok ? (state.failure?.message ?? null) : version.problem;
  useEffect(() => {
    if (problem !== null) {
      log.warn('vacuum.map_unreadable', { deviceId, problem });
    }
  }, [deviceId, problem]);
  return {
    scene,
    hasMapVersion: map !== null,
    problem,
    retry: state.failure === null ? undefined : state.retry,
  };
}

interface PlanAsk {
  readonly requested: StageView;
  readonly webgl: boolean;
}

function usePlan(
  props: MapViewProps,
  snapshot: VacuumSnapshot,
  ask: PlanAsk,
  feed: MapFeed,
): StagePlan {
  const { device } = props;
  return planStage({
    online: snapshot.online,
    webgl: ask.webgl,
    requested: ask.requested,
    hasMapVersion: feed.hasMapVersion,
    scene: feed.scene,
    unreadable: feed.problem !== null,
    lastSeenAt: useLastSeen(device.id)?.at ?? null,
    timeZone: useSettings().time_zone,
    fault: props.fault ?? null,
    notAccepted: props.notAccepted ?? null,
  });
}

function handlersOf(
  props: MapViewProps,
  online: boolean,
  feed: MapFeed,
  onNoWebgl: () => void,
): StageHandlers {
  return {
    onNoWebgl,
    onPickRoom: props.onPickRoom,
    onMapHome: props.onMapHome,
    mapHomeDisabled: !online,
    onRetry: feed.retry,
  };
}

const ROOM_KEYS: readonly VacuumChip['key'][] = [
  'cleaning',
  'mopping',
  'mapping',
  'paused',
  'mapping_paused',
  'remote',
];

const PILL_TONES: Readonly<Partial<Record<VacuumChip['tone'], StagePill['tone']>>> = {
  working: 'working',
  paused: 'paused',
  returning: 'returning',
  docked: 'idle',
  idle: 'idle',
  error: 'error',
};

const ASLEEP_PILL: StagePill = { text: 'Docked · asleep', tone: 'idle' };

function roomName(scene: VacuumScene | null, pose: VacuumScene['robot']): string | null {
  if (scene === null) {
    return null;
  }
  const roomId = roomAt(scene.rooms, pose);
  return scene.rooms.find((candidate) => candidate.id === roomId)?.name ?? null;
}

function pillWords(
  chip: VacuumChip,
  values: VacuumSnapshot['values'],
  room: string | null,
): string {
  const station = stationPillOf(values);
  if (station !== null) {
    return station;
  }
  return room === null ? chip.word : `${chip.word} · ${room}`;
}

function usePill(
  deviceId: string,
  snapshot: VacuumSnapshot,
  scene: VacuumScene | null,
): StagePill | null {
  const pose = valueOrNull(useVacuumPose(deviceId)) ?? scene?.robot ?? null;
  const chip = vacuumChipOf(snapshot.values, snapshot.online);
  if (chip.key === 'asleep') {
    return ASLEEP_PILL;
  }
  const tone = PILL_TONES[chip.tone];
  if (!chip.awake || tone === undefined) {
    return null;
  }
  const room = ROOM_KEYS.includes(chip.key) ? roomName(scene, pose) : null;
  return { text: pillWords(chip, snapshot.values, room), tone };
}

function mapViewOf(view: StageView | undefined): StageView {
  return view === undefined || view === 'camera' ? '3d' : view;
}

const FRAME: Readonly<Record<StageVariant, string>> = {
  page: '',
  pinned: '',
  hero: '',
  face: 'flex-1',
  full: 'flex-1',
  plain: '',
};

const HOSTED: ReadonlySet<StageVariant> = new Set(['page', 'hero', 'full']);

function useLiveHost(
  deviceId: string,
  variant: StageVariant,
  covered: boolean,
): StageLiveHost | undefined {
  const id = `${stageIdOf({ kind: 'vacuum-page', deviceId })}:${variant}:${useId()}`;
  return HOSTED.has(variant) ? { id, covered } : undefined;
}

interface Frame {
  readonly frame: RefObject<View | null>;
  readonly visible: boolean;
  readonly laidOut: () => void;
}

function useFrame(onReady: (() => void) | undefined): Frame {
  const frame = useRef<View>(null);
  const { visible, onLayout } = useOnScreen(frame);
  const laidOut = (): void => {
    onLayout?.();
    onReady?.();
  };
  return { frame, visible, laidOut };
}

interface Choice {
  readonly requested: StageView;
  readonly choose: (view: StageView) => void;
}

const UNIFIED: ReadonlySet<StageVariant> = new Set(['page', 'full']);

export function unifiedOf(variant: StageVariant, unified: UnifiedMap | null): UnifiedMap | null {
  return UNIFIED.has(variant) ? unified : null;
}

function useChoice(props: MapViewProps): Choice {
  const [picked, setPicked] = useState<StageView | null>(props.initialView ?? null);
  const choose = (view: StageView): void => {
    setPicked(view);
    props.onViewChange?.(view);
  };
  return { requested: picked ?? '3d', choose };
}

export function MapView(props: MapViewProps): ReactNode {
  const { device } = props;
  const variant = props.variant ?? 'page';
  const live = useLiveHost(device.id, variant, props.covered === true);
  const { snapshot } = useVacuum(device);
  const unified = unifiedOf(variant, useUnifiedMap(device.id, snapshot.mapVersionText));
  const { requested, choose } = useChoice(props);
  const [webgl, setWebgl] = useState(true);
  const { frame, visible, laidOut } = useFrame(props.onReady);
  useVacuumRoute(device.id, { stageId: live?.id ?? null, onScreen: visible });
  const feed = useMapFeed(device.id, snapshot.mapVersionText);
  const chip = vacuumChipOf(snapshot.values, snapshot.online);
  const plan = usePlan(props, snapshot, { requested, webgl }, feed);
  const pill = usePill(device.id, snapshot, feed.scene);
  const locate = useVacuumLocate(device);
  return (
    <View ref={frame} onLayout={laidOut} collapsable={false} className={FRAME[variant]}>
      <MapStage
        variant={variant}
        pill={plan.view === 'camera' ? null : pill}
        reserveBottom={props.reserveBottom === true}
        deviceId={device.id}
        plan={plan}
        status={stageStatus(chip.word, snapshot.online)}
        selection={props.selection ?? NO_SELECTION}
        turretRaised={props.turretRaised ?? 0}
        camera={
          <VacuumCamera
            deviceId={device.id}
            active={visible}
            compact={variant === 'face'}
            onClose={(): void => {
              choose(mapViewOf(props.initialView));
            }}
          />
        }
        onLocate={snapshot.online && variant !== 'plain' ? locate : undefined}
        onFullScreen={props.onFullScreen}
        live={live}
        unified={unified}
        className={props.className}
        handlers={handlersOf(props, snapshot.online, feed, (): void => {
          setWebgl(false);
          props.onUnavailable?.();
        })}
        onViewChange={choose}
      />
    </View>
  );
}
