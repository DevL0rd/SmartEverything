import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { isVacuumTaskPhase, vacuumPhase, type VacuumCleanSummary } from '@smarteverything/domain';
import { StatusChip } from '../../../components/status-chip';
import { ActionBand } from '../../../components/widget-board/action-band';
import { Text } from '../../../components/text';
import { useScreenLive } from '../../../design/animation-gate';
import { cn } from '../../../design/cn';
import { useOnScreen } from '../../../design/visibility';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { DeviceVisual } from '../../device-visuals';
import type { CardFaceProps } from '../card/card-face';
import type { StageView } from './components/map-view-model';
import { LinkBadge } from './components/link-badge';
import { stationStopOf } from './components/station-stop';
import { useVacuumCleans } from './data/cleans-query';
import { useVacuumPose } from './data/use-vacuum-pose';
import { useNextCleanDay } from './data/use-vacuum-schedules';
import { consumablesOf } from './model/consumables';
import { valueOrNull } from './model/readings';
import { roomAt } from './model/room-at';
import { useFaceFacts, type FaceFacts } from './face-facts';
import {
  actionsOf,
  awakeDetail,
  cameraLive,
  faceProgress,
  faceTiles,
  mostWorn,
  lastCleanLine,
  layoutOf,
  mountedView,
  type FaceMount,
} from './face-model';
import { faceOptionsOf } from './face-options';
import {
  ActionRow,
  AwakeStage,
  Battery,
  Figures,
  PhaseText,
  RestNotes,
  RestStage,
  RoomChips,
  StageFrame,
  slotOf,
  type FaceRowProps,
  type StageSlot,
} from './face-parts';
import {
  pruneSelection,
  roomChips,
  toggleRoom,
  NO_SELECTION,
  type RoomSelection,
} from './model/room-selection';

const WIDE_FROM = 560;

interface LaneProps {
  readonly device: Device;
  readonly facts: FaceFacts;
  readonly slot: StageSlot;
}

function useRoomSelection(facts: FaceFacts): readonly [RoomSelection, (id: number) => void] {
  const [chosen, setChosen] = useState<RoomSelection>(NO_SELECTION);
  const selection = pruneSelection(chosen, facts.scene?.rooms ?? []);
  return [
    selection,
    (id): void => {
      setChosen(toggleRoom(selection, id));
    },
  ];
}

function useCurrentRoom(device: Device, facts: FaceFacts): number | null {
  const pose = valueOrNull(useVacuumPose(device.id));
  const { scene } = facts;
  return scene === null || !facts.chip.awake ? null : roomAt(scene.rooms, pose ?? scene.robot);
}

function useLastClean(device: Device, facts: FaceFacts): VacuumCleanSummary | null {
  const total = facts.vacuum.snapshot.values.vacuum_total_cleans;
  const { cleans } = useVacuumCleans(device.id, typeof total === 'number' ? total : null);
  return cleans[0] ?? null;
}

function runningJob(facts: FaceFacts, atStation: boolean): FaceFacts['job'] {
  const phase = vacuumPhase(facts.vacuum.snapshot.values);
  return !atStation && isVacuumTaskPhase(phase) ? facts.job : null;
}

function useDetail(device: Device, facts: FaceFacts): string | null {
  const lastClean = useLastClean(device, facts);
  const atStation = stationStopOf(facts.vacuum.presentation, facts.vacuum.snapshot.values) !== null;
  const now = useMinute();
  const zone = useSettings().time_zone;
  if (!facts.vacuum.snapshot.online) {
    return null;
  }
  if (facts.chip.key === 'error') {
    return facts.fault?.title ?? null;
  }
  if (facts.chip.awake) {
    const job = runningJob(facts, atStation);
    return awakeDetail(job?.title ?? null, job?.elapsedSeconds ?? null);
  }
  return lastCleanLine(lastClean, now, zone);
}

function Title({
  device,
  lines = 1,
}: {
  readonly device: Device;
  readonly lines?: 1 | 2;
}): ReactNode {
  return (
    <Text variant="body-strong" numberOfLines={lines}>
      {device.label}
    </Text>
  );
}

function DetailNotes({
  device,
  facts,
  lines,
}: {
  readonly device: Device;
  readonly facts: FaceFacts;
  readonly lines: 1 | 2;
}): ReactNode {
  return <RestNotes detail={useDetail(device, facts)} lines={lines} />;
}

function LinkedTitle({
  device,
  links,
  lines = 1,
}: {
  readonly device: Device;
  readonly links: FaceFacts['links'];
  readonly lines?: 1 | 2;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-1" pointerEvents="box-none">
      <View className="min-w-0 flex-1" pointerEvents="none">
        <Title device={device} lines={lines} />
      </View>
      <LinkBadge deviceId={device.id} notice={links} className="-my-2 -mr-1" />
    </View>
  );
}

interface ChipProps {
  readonly device: Device;
  readonly facts: FaceFacts;
  readonly selection: RoomSelection;
  readonly pick: ((id: number) => void) | null;
}

function LaneChips({ device, facts, selection, pick }: ChipProps): ReactNode {
  const currentRoomId = useCurrentRoom(device, facts);
  const chips = roomChips(
    facts.scene?.rooms ?? [],
    pick === null ? NO_SELECTION : selection,
    pick === null ? currentRoomId : null,
  );
  return <RoomChips chips={chips} onPick={pick ?? undefined} />;
}

interface SideParts {
  readonly row: FaceRowProps;
  readonly chips: Omit<ChipProps, 'device' | 'facts'>;
}

function useSideParts(device: Device, facts: FaceFacts): SideParts {
  const [selection, pick] = useRoomSelection(facts);
  const { snapshot } = facts.vacuum;
  const awake = facts.chip.awake;
  const actions = actionsOf(vacuumPhase(snapshot.values), snapshot.online, selection.length);
  const picking = actions.primary?.id === 'start';
  return {
    row: { device, facts, actions, selection: awake ? NO_SELECTION : selection },
    chips: { selection, pick: picking ? pick : null },
  };
}

function Heading({ device, facts, slot }: LaneProps): ReactNode {
  const tall = slot === 'stack' || slot === 'side';
  return (
    <View className="gap-1" pointerEvents="box-none">
      <LinkedTitle device={device} links={facts.links} lines={slot === 'm' ? 2 : 1} />
      <View className="flex-row items-center gap-3" pointerEvents="none">
        <Battery battery={facts.battery} size={slot === 'side' ? 'lg' : 'md'} />
        <View className="min-w-0 flex-1 gap-0.5">
          <PhaseText device={device} facts={facts} live={facts.chip.awake} strong={tall} />
          {slot === 'm' ? null : <DetailNotes device={device} facts={facts} lines={tall ? 2 : 1} />}
        </View>
      </View>
    </View>
  );
}

function SideTiles({ device, facts }: Pick<LaneProps, 'device' | 'facts'>): ReactNode {
  const nextClean = useNextCleanDay(device.id);
  const job = runningJob(facts, false);
  const tiles = faceTiles({
    awake: facts.chip.awake,
    doneAreaM2: job?.doneAreaM2 ?? null,
    elapsedSeconds: job?.elapsedSeconds ?? null,
    nextClean,
    worn: mostWorn(consumablesOf(facts.vacuum.snapshot.values)),
  });
  return <Figures tiles={tiles} />;
}

function Lane(props: LaneProps): ReactNode {
  const { device, facts, slot } = props;
  const { row, chips } = useSideParts(device, facts);
  const below = slot === 'stack' && facts.chip.awake;
  return (
    <View
      className={cn('min-w-0 gap-1.5', below ? 'flex-none' : 'flex-1')}
      pointerEvents="box-none"
    >
      <Heading {...props} />
      {slot === 'side' ? <SideTiles device={device} facts={facts} /> : null}
      {slot === 'stack' || slot === 'side' ? (
        <LaneChips device={device} facts={facts} {...chips} />
      ) : null}
      <ActionBand>
        <ActionRow {...row} look={slot === 'm' ? 'icon' : 'compact'} />
      </ActionBand>
    </View>
  );
}

const CONTAINER: Readonly<Record<StageSlot, string>> = {
  m: 'flex-1 flex-row gap-3',
  w: 'flex-1 flex-row gap-4',
  stack: 'flex-1 gap-3',
  side: 'flex-1 flex-row gap-4',
};

function containerOf(slot: StageSlot, awake: boolean): string {
  return awake || slot === 'm' ? CONTAINER[slot] : CONTAINER.w;
}

interface StagedProps {
  readonly device: Device;
  readonly facts: FaceFacts;
  readonly slot: StageSlot;
  readonly option: StageView;
}

interface StageChoice {
  readonly live: boolean;
  readonly view: FaceMount;
  readonly tap: () => void;
  readonly untap: () => void;
}

function useStageView(option: StageView, visible: boolean): StageChoice {
  const { focused, foreground } = useScreenLive();
  const [tapped, setTapped] = useState(false);
  const onScreen = { visible, focused, foreground };
  const live = cameraLive(option, tapped, onScreen);
  if (tapped && !(visible && focused && foreground)) {
    setTapped(false);
  }
  return {
    live,
    view: mountedView(onScreen),
    tap: (): void => {
      setTapped(true);
    },
    untap: (): void => {
      setTapped(false);
    },
  };
}

function AwakeSlot({
  device,
  facts,
  slot,
  option,
  visible,
}: StagedProps & { readonly visible: boolean }): ReactNode {
  const stage = useStageView(option, visible);
  return (
    <AwakeStage
      device={device}
      slot={slot}
      view={stage.view}
      cameraLive={stage.live}
      cameraOffered={option === 'camera'}
      error={facts.chip.key === 'error'}
      onCamera={stage.tap}
      onCameraClosed={stage.untap}
    />
  );
}

function StagedFace(props: StagedProps): ReactNode {
  const { device, facts, slot } = props;
  const { snapshot, presentation } = facts.vacuum;
  const frame = useRef<View>(null);
  const { visible, onLayout } = useOnScreen(frame);
  const awake = facts.chip.awake;
  const stop = stationStopOf(presentation, snapshot.values);
  const job = runningJob(facts, stop !== null);
  const progress = faceProgress(awake, stop?.progress ?? null, job?.progress ?? null);
  return (
    <View
      ref={frame}
      onLayout={onLayout}
      collapsable={false}
      className={containerOf(slot, awake)}
      pointerEvents="box-none"
    >
      <StageFrame
        slot={slot}
        resting={!awake}
        progress={progress}
        tone={facts.chip.tone === 'paused' ? 'warning' : 'primary'}
      >
        {awake ? (
          <AwakeSlot {...props} visible={visible} />
        ) : (
          <RestStage device={device} slot={slot} />
        )}
      </StageFrame>
      <Lane slot={slot} device={device} facts={facts} />
    </View>
  );
}

function TileFace({ device, facts }: Pick<StagedProps, 'device' | 'facts'>): ReactNode {
  return (
    <View className="flex-1 justify-between gap-2" pointerEvents="box-none">
      <View className="flex-row items-start justify-between gap-2" pointerEvents="none">
        <DeviceVisual device={device} size="tile" />
        {facts.vacuum.snapshot.online ? null : <StatusChip status="offline" />}
      </View>
      <View className="gap-0.5" pointerEvents="none">
        <Title device={device} />
        <PhaseText device={device} facts={facts} live={false} />
      </View>
      <ActionBand />
    </View>
  );
}

export function VacuumFace({ device, cls, frame, options }: CardFaceProps): ReactNode {
  const facts = useFaceFacts(device);
  const slot = slotOf(layoutOf(cls), frame.width >= WIDE_FROM);
  return slot === null ? (
    <TileFace device={device} facts={facts} />
  ) : (
    <StagedFace device={device} facts={facts} slot={slot} option={faceOptionsOf(options).view} />
  );
}
