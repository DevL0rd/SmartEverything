import { isPhysicalPresence } from '../../../plugins/shelly-presence/presence-data';
import type { Device } from '../../../store/state';
import type { StageBoard, StageConsumer, StageDemandFacts } from '../components/stage/stage-states';

export interface PlacedMap {
  readonly floors: readonly { readonly placements: readonly { readonly deviceId: string }[] }[];
}

export interface DemandLook {
  readonly showRobot: boolean;
  readonly showPeople: boolean;
}

export interface BoardStages {
  readonly inline: StageConsumer;
  readonly full: StageConsumer;
}

const BOARD_STAGES: Readonly<Record<StageBoard, BoardStages>> = {
  home: { inline: { kind: 'home-hero' }, full: { kind: 'home-full-screen' } },
  devices: { inline: { kind: 'devices-pinned' }, full: { kind: 'devices-full-screen' } },
};

export function boardStagesOf(board: StageBoard): BoardStages {
  return BOARD_STAGES[board];
}

export function mapDemandFacts(
  map: PlacedMap | null,
  devices: readonly Device[],
  look: DemandLook,
): StageDemandFacts {
  const placed = new Set(
    map?.floors.flatMap((floor) => floor.placements.map((placement) => placement.deviceId)) ?? [],
  );
  const shown = devices.filter((device) => placed.has(device.id));
  return {
    vacuumIds: shown.filter((device) => device.kind === 'vacuum').map((device) => device.id),
    sensorIds: shown.filter(isPhysicalPresence).map((device) => device.external_id),
    showRobot: look.showRobot,
    showPeople: look.showPeople,
  };
}
