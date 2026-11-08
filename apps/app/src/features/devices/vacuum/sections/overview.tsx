import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  VACUUM_CLEAN_ROOMS_KEY,
  VACUUM_POSE_KEY,
  isVacuumTaskPhase,
  vacuumPhase,
  type JsonValue,
  type VacuumScene,
  type VacuumValues,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { slotOf } from '../../../../store/command-ledger';
import { useMinute } from '../../../../store/clock';
import { useDeviceDerived, useSettings } from '../../../../store/selectors';
import { useStoreSelector } from '../../../../store/store-context';
import { ledgerEntry } from '../../../../store/subscriptions';
import type { Device } from '../../../../store/state';
import { useDisplayName } from '../../model/display-name';
import { useLastSeen } from '../../model/last-seen';
import { mapIsBlank, StageFullScreen, useHomeMap } from '../../../home-map';
import { LinkBadge } from '../components/link-badge';
import { MapView } from '../components/map-view';
import { VacuumNoMap } from '../components/vacuum-no-map';
import { StationStopButton, stationStopOf, type StationStop } from '../components/station-stop';
import { VACUUM_CLEANING_CAPABILITY } from '../data/actions';
import { parseMapVersion, parsePose } from '../data/map-feed';
import { useVacuumCleans } from '../data/cleans-query';
import { useLinkNotice } from '../data/room-links-value';
import { useVacuumScene } from '../data/scene-query';
import { useVacuum } from '../data/use-vacuum';
import { useVacuumActions } from '../data/use-vacuum-actions';
import { useVacuumFault, type VacuumFault } from '../data/use-vacuum-fault';
import { jobSummaryOf, type JobSummary } from '../model/job-summary';
import { vacuumChipOf, type VacuumChip } from '../model/phase-chip';
import { readProblems } from '../model/problems';
import { readingOf, valueOrNull } from '../model/readings';
import { roomAt } from '../model/room-at';
import {
  NO_SELECTION,
  pruneSelection,
  roomChips,
  toggleRoom,
  type RoomSelection,
  type SelectableRoom,
} from '../model/room-selection';
import { lastCleanLine } from '../face-model';
import type { RevealTarget } from '../page-model';
import { RoomChips } from './overview-chips';
import { CommandRow, ShowRow, Strip } from './overview-parts';
import {
  lastSeenMsOf,
  primaryRowOf,
  stageFaultOf,
  stripOf,
  stripTitle,
  type RowAction,
  type StatusStrip,
} from './overview-model';

const log = new Logger('app.devices');

const NO_ROOMS: VacuumScene['rooms'] = [];

function useSceneOf(deviceId: string, versionText: JsonValue | undefined): VacuumScene | null {
  const version = valueOrNull(readingOf(() => parseMapVersion(versionText)));
  return useVacuumScene(deviceId, version).scene;
}

function useCurrentRoomId(deviceId: string, scene: VacuumScene | null): number | null {
  return useDeviceDerived(
    deviceId,
    (values) => {
      if (scene === null) {
        return null;
      }
      const pose = valueOrNull(readingOf(() => parsePose(values[VACUUM_POSE_KEY]?.value)));
      return roomAt(scene.rooms, pose ?? scene.robot);
    },
    [scene],
    Object.is,
  );
}

function useRefused(deviceId: string): boolean {
  return useStoreSelector(
    (state) =>
      [VACUUM_CLEANING_CAPABILITY, VACUUM_CLEAN_ROOMS_KEY].some(
        (key) => (ledgerEntry(state, slotOf(deviceId, key))?.failure ?? null) !== null,
      ),
    Object.is,
    [deviceId],
  );
}

function useReadProblems(deviceId: string, problems: string): void {
  useEffect(() => {
    if (problems !== '') {
      log.warn('vacuum.values_unreadable', { deviceId, problems });
    }
  }, [deviceId, problems]);
}

interface Picking {
  readonly selection: RoomSelection;
  readonly pick: (roomId: number | null) => void;
  readonly clear: () => void;
}

export function isTaskRunning(values: VacuumValues): boolean {
  return isVacuumTaskPhase(vacuumPhase(values));
}

export function selectionOf(input: {
  readonly taskRunning: boolean;
  readonly picked: RoomSelection;
  readonly job: JobSummary | null;
  readonly rooms: readonly SelectableRoom[];
}): RoomSelection {
  const { taskRunning, picked, job, rooms } = input;
  if (taskRunning) {
    return job === null ? NO_SELECTION : job.rooms.map((room) => room.id);
  }
  return pruneSelection(picked, rooms);
}

function usePicking(
  taskRunning: boolean,
  job: JobSummary | null,
  rooms: VacuumScene['rooms'],
): Picking {
  const [picked, setPicked] = useState<RoomSelection>(NO_SELECTION);
  const selection = selectionOf({ taskRunning, picked, job, rooms });
  return {
    selection,
    pick: (roomId): void => {
      setPicked(roomId === null ? NO_SELECTION : toggleRoom(selection, roomId));
    },
    clear: (): void => {
      setPicked(NO_SELECTION);
    },
  };
}

interface Run {
  readonly press: (action: RowAction) => void;
  readonly notAccepted: string | null;
}

function useRun(device: Device, picking: Picking): Run {
  const actions = useVacuumActions(device);
  const refused = useRefused(device.id);
  const [sent, setSent] = useState<string | null>(null);
  const { selection, clear } = picking;
  return {
    notAccepted: refused ? sent : null,
    press: (action): void => {
      setSent(action.label.toLowerCase());
      if (action.key === 'start' && selection.length > 0) {
        actions.cleanRooms(selection);
        clear();
      } else {
        actions.command(action.key);
      }
    },
  };
}

interface Parts {
  readonly chip: VacuumChip;
  readonly rooms: VacuumScene['rooms'];
  readonly roomId: number | null;
  readonly job: JobSummary | null;
  readonly strip: StatusStrip;
  readonly headline: string;
  readonly taskRunning: boolean;
  readonly stop: StationStop | null;
  readonly fault: VacuumFault | null;
}

function useLastCleanLine(device: Device, values: VacuumValues): string | null {
  const total = values.vacuum_total_cleans;
  const { cleans } = useVacuumCleans(device.id, typeof total === 'number' ? total : null);
  const now = useMinute();
  const zone = useSettings().time_zone;
  return lastCleanLine(cleans[0] ?? null, now, zone);
}

function useParts(device: Device): Parts {
  const { snapshot, presentation } = useVacuum(device);
  const { values, online } = snapshot;
  const stop = online ? stationStopOf(presentation, values) : null;
  const chip = vacuumChipOf(values, online);
  const scene = useSceneOf(device.id, snapshot.mapVersionText);
  const rooms = scene?.rooms ?? NO_ROOMS;
  const roomId = useCurrentRoomId(device.id, scene);
  const job = valueOrNull(jobSummaryOf(values, rooms));
  const fault = useVacuumFault(device.id);
  useReadProblems(device.id, readProblems(values).join('; '));
  const stripInput = {
    values,
    online,
    stationProgress: stop?.progress ?? null,
    lastSeenMs: lastSeenMsOf(useLastSeen(device.id)?.at),
    roomName: rooms.find((room) => room.id === roomId)?.name ?? null,
    job,
  };
  const strip = stripOf(stripInput, useLastCleanLine(device, values));
  const headline = stripTitle(stripInput);
  return {
    chip,
    rooms,
    roomId,
    job,
    strip,
    headline,
    taskRunning: isTaskRunning(values),
    stop,
    fault,
  };
}

export function useVacuumHeadline(device: Device): string {
  return useParts(device).headline;
}

function HeroMap({
  device,
  onPickRoom,
  working,
  ...stage
}: {
  readonly device: Device;
  readonly working: boolean;
  readonly selection: RoomSelection;
  readonly fault: VacuumFault | null;
  readonly notAccepted: string | null;
  readonly onPickRoom: ((roomId: number | null) => void) | undefined;
}): ReactNode {
  const [fullScreen, setFullScreen] = useState(false);
  const name = useDisplayName(device.id);
  const { map } = useHomeMap();
  if (map !== null && mapIsBlank(map)) {
    return <VacuumNoMap device={device} map={map} working={working} />;
  }
  return (
    <>
      <MapView
        device={device}
        {...stage}
        covered={fullScreen}
        onFullScreen={(): void => {
          setFullScreen(true);
        }}
        {...(onPickRoom === undefined ? {} : { onPickRoom })}
      />
      {fullScreen ? (
        <StageFullScreen
          title={name}
          onClose={(): void => {
            setFullScreen(false);
          }}
        >
          <MapView device={device} variant="full" className="rounded-lg" />
        </StageFullScreen>
      ) : null}
    </>
  );
}

function StopRow({
  device,
  stop,
}: {
  readonly device: Device;
  readonly stop: StationStop;
}): ReactNode {
  return (
    <View className="flex-row justify-end">
      <StationStopButton device={device} stop={stop} />
    </View>
  );
}

function RoomsBadge({
  deviceId,
  onOpen,
}: {
  readonly deviceId: string;
  readonly onOpen: () => void;
}): ReactNode {
  return <LinkBadge deviceId={deviceId} notice={useLinkNotice(deviceId)} onOpen={onOpen} />;
}

export function VacuumOverview({
  device,
  onShow,
}: {
  readonly device: Device;
  readonly onShow: (target: RevealTarget) => void;
}): ReactNode {
  const { chip, rooms, roomId, job, strip, taskRunning, stop, fault } = useParts(device);
  const picking = usePicking(taskRunning, job, rooms);
  const { selection, pick, clear } = picking;
  const run = useRun(device, picking);
  return (
    <View className="gap-4">
      <HeroMap
        device={device}
        selection={selection}
        fault={stageFaultOf(chip, fault, strip.title)}
        notAccepted={run.notAccepted}
        onPickRoom={taskRunning ? undefined : pick}
        working={taskRunning}
      />
      <Strip
        strip={strip}
        badge={
          <RoomsBadge
            deviceId={device.id}
            onOpen={() => {
              onShow('rooms');
            }}
          />
        }
      />
      <View className="gap-2">
        {stop === null ? (
          <CommandRow actions={primaryRowOf(chip, selection.length)} onPress={run.press} />
        ) : (
          <StopRow device={device} stop={stop} />
        )}
        {chip.key === 'offline' ? null : <ShowRow onShow={onShow} />}
      </View>
      <RoomChips
        chips={roomChips(rooms, selection, roomId)}
        anySelected={selection.length > 0}
        disabled={taskRunning || chip.key === 'offline'}
        onToggle={pick}
        onAll={clear}
      />
    </View>
  );
}
