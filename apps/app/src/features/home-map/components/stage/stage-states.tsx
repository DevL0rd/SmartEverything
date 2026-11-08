import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Button } from '../../../../components/button';
import { Text } from '../../../../components/text';
import { useColourResolver } from '../../../../design/colour';
import type { IsoStillInput } from '../../../../components/house-map/iso/model';
import { IsoStill } from '../../../../components/house-map/iso/iso-still';
import type { MapDemandInput } from '../../../../components/house-map/live-demand/use-map-demand';
import type { StageStillState } from '../../../../components/house-map/live-visibility/stage-host';
import type { RenderFloor } from '../../../../components/house-map/render-scene';
import { NoticeChip, type StageNotice } from './stage-chrome';

export type StageConsumer =
  | {
      readonly kind: 'home-hero' | 'home-full-screen' | 'devices-pinned' | 'devices-full-screen';
    }
  | { readonly kind: 'room-header'; readonly roomId: string }
  | { readonly kind: 'vacuum-page'; readonly deviceId: string }
  | { readonly kind: 'vacuum-face'; readonly deviceId: string; readonly board: StageBoard }
  | { readonly kind: 'shelly-page'; readonly deviceId: string; readonly sensorId: string }
  | {
      readonly kind: 'shelly-face';
      readonly deviceId: string;
      readonly sensorId: string;
      readonly board: StageBoard;
    };

export type StageBoard = 'home' | 'devices';

export function stageIdOf(consumer: StageConsumer): string {
  switch (consumer.kind) {
    case 'home-hero':
    case 'home-full-screen':
    case 'devices-pinned':
    case 'devices-full-screen':
      return `home-map.${consumer.kind}`;
    case 'room-header':
      return `home-map.room-header.${consumer.roomId}`;
    case 'vacuum-page':
    case 'shelly-page':
      return `home-map.${consumer.kind}.${consumer.deviceId}`;
    case 'vacuum-face':
    case 'shelly-face':
      return `home-map.${consumer.kind}.${consumer.board}.${consumer.deviceId}`;
  }
}

export interface StageDemandFacts {
  readonly vacuumIds: readonly string[];
  readonly sensorIds: readonly string[];
  readonly showRobot: boolean;
  readonly showPeople: boolean;
}

function others(shown: boolean, ids: readonly string[]): readonly string[] {
  return shown ? ids : [];
}

export function stageDemand(consumer: StageConsumer, facts: StageDemandFacts): MapDemandInput {
  const stageId = stageIdOf(consumer);
  if (consumer.kind === 'vacuum-page' || consumer.kind === 'vacuum-face') {
    return {
      stageId,
      liveRobot: true,
      liveTracks: facts.showPeople,
      vacuumIds: [consumer.deviceId, ...others(facts.showRobot, facts.vacuumIds)],
      sensorIds: facts.sensorIds,
    };
  }
  if (consumer.kind === 'shelly-page' || consumer.kind === 'shelly-face') {
    return {
      stageId,
      liveRobot: facts.showRobot,
      liveTracks: true,
      vacuumIds: facts.vacuumIds,
      sensorIds: [consumer.sensorId, ...others(facts.showPeople, facts.sensorIds)],
    };
  }
  return {
    stageId,
    liveRobot: facts.showRobot,
    liveTracks: facts.showPeople,
    vacuumIds: facts.vacuumIds,
    sensorIds: facts.sensorIds,
  };
}

export interface StageDataFacts {
  readonly hasMap: boolean;
  readonly loading: boolean;
  readonly floor: RenderFloor | null;
}

export type StagePhase = 'skeleton' | 'no-map' | 'empty-floor' | 'map';

export function stagePhase(facts: StageDataFacts): StagePhase {
  if (facts.hasMap) {
    return facts.floor === null || facts.floor.rooms.length === 0 ? 'empty-floor' : 'map';
  }
  return facts.loading || facts.floor !== null ? 'skeleton' : 'no-map';
}

export function stageChromeShown(phase: StagePhase): boolean {
  return phase === 'map' || phase === 'empty-floor';
}

export function stageDimmed(phase: StagePhase, connected: boolean): boolean {
  return !connected && phase !== 'no-map';
}

export interface StageMapNotice {
  readonly text: string;
  readonly onPress?: (() => void) | undefined;
}

export interface StageStatusFacts {
  readonly phase: StagePhase;
  readonly connected: boolean;
  readonly loadFailed: boolean;
  readonly crashed: boolean;
  readonly leaseFailed: boolean;
  readonly madeFromRobot: boolean;
  readonly mapNotices: readonly StageMapNotice[];
}

export interface StageStatusActions {
  readonly onEdit?: (() => void) | undefined;
  readonly onRetryLoad?: (() => void) | undefined;
  readonly onReload?: (() => void) | undefined;
  readonly onRetryLive?: (() => void) | undefined;
  readonly onReview?: (() => void) | undefined;
}

function mapGroup(facts: StageStatusFacts, actions: StageStatusActions): StageNotice | null {
  const robot: readonly StageMapNotice[] = facts.madeFromRobot
    ? [{ text: "Made from the robot's map · Edit", onPress: actions.onEdit }]
    : [];
  const all = [...robot, ...facts.mapNotices];
  const [first] = all;
  if (first === undefined) return null;
  if (all.length === 1) return { icon: 'info', text: first.text, onPress: first.onPress };
  return {
    icon: 'info',
    text: `${String(all.length)} map notices · Review`,
    onPress: actions.onReview,
  };
}

function connectionNotice(
  facts: StageStatusFacts,
  actions: StageStatusActions,
): StageNotice | null {
  if (!facts.connected && facts.phase !== 'no-map') {
    return { icon: 'cloud', text: 'Offline · showing the last map' };
  }
  if (facts.loadFailed && facts.phase === 'skeleton') {
    return { icon: 'warning', text: "Couldn't load the map · Retry", onPress: actions.onRetryLoad };
  }
  return null;
}

export function stageNotices(
  facts: StageStatusFacts,
  actions: StageStatusActions,
): readonly StageNotice[] {
  if (facts.phase === 'no-map') return [];
  const connection = connectionNotice(facts, actions);
  const crash: StageNotice | null = facts.crashed
    ? { icon: 'warning', text: '3D stopped · Reload', onPress: actions.onReload }
    : null;
  const lease: StageNotice | null =
    facts.leaseFailed && facts.connected
      ? { icon: 'alert', text: "Live view couldn't start · Retry", onPress: actions.onRetryLive }
      : null;
  const shown = facts.phase === 'map' || facts.phase === 'empty-floor';
  return [connection, crash, lease, shown ? mapGroup(facts, actions) : null].filter(
    (notice): notice is StageNotice => notice !== null,
  );
}

export function StageNotices({ notices }: { readonly notices: readonly StageNotice[] }): ReactNode {
  return (
    <View pointerEvents="box-none" className="items-start gap-2">
      {notices.map((notice) => (
        <NoticeChip key={notice.text} notice={notice} />
      ))}
    </View>
  );
}

export function stageNoticesNode(notices: readonly StageNotice[]): ReactNode {
  return notices.length === 0 ? null : <StageNotices notices={notices} />;
}

const SKELETON_ROOMS = [
  'M100 22 L148 46 L112 64 L64 40 Z',
  'M148 46 L184 64 L148 82 L112 64 Z',
  'M64 40 L112 64 L76 82 L28 58 Z',
  'M112 64 L148 82 L112 100 L76 82 Z',
] as const;

export function StageSkeleton(): ReactNode {
  const resolve = useColourResolver();
  const fill = resolve('surface-3');
  const edge = resolve('outline-variant');
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Home map, loading"
      className="h-full w-full items-center justify-center bg-surface-2 p-6"
    >
      <Svg width="100%" height="100%" viewBox="0 0 212 122" preserveAspectRatio="xMidYMid meet">
        {SKELETON_ROOMS.map((d) => (
          <Path key={d} d={d} fill={fill} stroke={edge} strokeWidth={1} strokeLinejoin="round" />
        ))}
      </Svg>
    </View>
  );
}

export function EmptyFloorRow({
  floorName,
  onDrawRooms,
}: {
  readonly floorName: string | null;
  readonly onDrawRooms: (() => void) | undefined;
}): ReactNode {
  const spoken = floorName === null ? 'Nothing on this floor yet' : `Nothing on ${floorName} yet`;
  return (
    <View pointerEvents="box-none" className="absolute inset-0 items-center justify-center px-4">
      <View className="max-w-full flex-row flex-wrap items-center justify-center gap-3 rounded-full border-hairline border-outline-variant bg-surface-raised py-1 pr-1 pl-4">
        <Text variant="callout" tone="variant" accessibilityLabel={spoken}>
          Nothing on this floor yet
        </Text>
        {onDrawRooms === undefined ? null : (
          <Button label="Draw rooms" icon="pencil" variant="tonal" onPress={onDrawRooms} />
        )}
      </View>
    </View>
  );
}

const UNAVAILABLE: StageNotice = { icon: 'layers', text: "3D isn't available on this device" };

export interface StageStillProps {
  readonly input: IsoStillInput | null;
  readonly name: string | null;
  readonly state: StageStillState;
  readonly transparent?: boolean;
}

export function StageStillView({
  input,
  name,
  state,
  transparent = false,
}: StageStillProps): ReactNode {
  return (
    <View className="h-full w-full">
      {input === null ? (
        <StageSkeleton />
      ) : (
        <IsoStill
          input={input}
          name={name}
          fill
          className={transparent ? 'bg-transparent!' : undefined}
        />
      )}
      {state.unavailable ? (
        <View pointerEvents="none" className="absolute inset-x-3 top-16 items-center">
          <NoticeChip notice={UNAVAILABLE} />
        </View>
      ) : null}
    </View>
  );
}

export function stageStill(
  input: IsoStillInput | null,
  name: string | null,
): (state: StageStillState) => ReactNode {
  return function StillOfStage(state: StageStillState): ReactNode {
    return <StageStillView input={input} name={name} state={state} />;
  };
}

export const NO_MAP_NAME = 'Home';

export function noMapTitle(mapName: string | null): string {
  const name = mapName === null || mapName.trim() === '' ? NO_MAP_NAME : mapName.trim();
  return `${name} has no map yet`;
}

export function noMapLine(hasVacuum: boolean): string {
  return hasVacuum
    ? 'See every room and device where it really is. Draw the rooms yourself, or let your robot vacuum make it.'
    : 'See every room and device where it really is. Draw the rooms, then place your devices.';
}

export interface NoMapRobotFacts {
  readonly unfedMaps: boolean;
  readonly working: boolean;
}

export interface NoMapRobotActions {
  readonly importMap: boolean;
  readonly quickMapping: boolean;
}

export function noMapRobotActions(robot: NoMapRobotFacts | null): NoMapRobotActions {
  if (robot === null) return { importMap: false, quickMapping: false };
  return { importMap: robot.unfedMaps, quickMapping: !robot.unfedMaps && !robot.working };
}

export const NO_MAP_ILLUSTRATION_MIN_HEIGHT = 420;

const HOUSE_WALLS = 'M28 58 L100 22 L184 64 L112 100 Z';

export function NoMapHouse(): ReactNode {
  const resolve = useColourResolver();
  const fill = resolve('surface-3');
  const edge = resolve('outline');
  const plan = resolve('outline-variant');
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={212} height={122} viewBox="0 0 212 122">
        {SKELETON_ROOMS.map((d) => (
          <Path key={d} d={d} fill={fill} stroke={plan} strokeWidth={1} strokeLinejoin="round" />
        ))}
        <Path
          d={HOUSE_WALLS}
          fill="none"
          stroke={edge}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
