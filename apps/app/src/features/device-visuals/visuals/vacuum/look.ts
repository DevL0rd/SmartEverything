import {
  DEFAULT_VACUUM_FINISH,
  VacuumValueError,
  isVacuumAwake,
  vacuumPhase,
  vacuumStation,
  type JsonValue,
  type VacuumFinish,
  type VacuumPhase,
  type VacuumStation,
  type VacuumStationMode,
  type VacuumValues,
} from '@smarteverything/domain';

export type { VacuumFinish };

export type VacuumScene = 'robot' | 'dock' | 'both';

export interface VacuumLook {
  readonly scene: VacuumScene;
  readonly phase: VacuumPhase | null;
  readonly station: VacuumStationMode | null;
  readonly stationProgress: number | null;
  readonly online: boolean;
  readonly asleep: boolean;
  readonly lifted: boolean;
  readonly lidarUp: boolean;
  readonly finish: VacuumFinish;
  readonly cleanTank: number | null;
  readonly dirtyTank: number | null;
  readonly bag: number | null;
  readonly battery: number | null;
}

const WORKING: readonly VacuumPhase[] = ['cleaning', 'mopping', 'mapping', 'remote', 'summoned'];

const LOW_BATTERY = 0.2;

export function isLowBattery(look: VacuumLook): boolean {
  return look.online && look.battery !== null && look.battery < LOW_BATTERY;
}

const RESTING_LOOK: VacuumLook = {
  scene: 'both',
  phase: null,
  station: null,
  stationProgress: null,
  online: true,
  asleep: false,
  lifted: false,
  lidarUp: false,
  finish: DEFAULT_VACUUM_FINISH,
  cleanTank: null,
  dirtyTank: null,
  bag: null,
  battery: null,
};

const LIDAR_UP: readonly JsonValue[] = ['Top', 'Lifting'];

function share(percent: number): number {
  return Math.min(1, Math.max(0, percent / 100));
}

function isState(value: JsonValue | undefined, number: number, name: string): boolean {
  return value === number || value === name;
}

function cleanTankOf(value: JsonValue | undefined): number | null {
  if (isState(value, 1, 'Empty')) {
    return 0;
  }
  return isState(value, 0, 'Not Empty') ? 1 : null;
}

function dirtyTankOf(value: JsonValue | undefined): number | null {
  if (isState(value, 1, 'Full')) {
    return 1;
  }
  return isState(value, 0, 'Not Full') ? 0 : null;
}

function progressShare(progress: number | null | undefined): number | null {
  return progress === null || progress === undefined ? null : share(progress);
}

function shareOf(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? share(value) : null;
}

function isAsleep(values: VacuumValues): boolean {
  return values.vacuum_asleep === true && !isVacuumAwake(values);
}

function stationOf(values: VacuumValues): VacuumStation | null {
  try {
    return vacuumStation(values);
  } catch (error) {
    if (error instanceof VacuumValueError) {
      return null;
    }
    throw error;
  }
}

export function vacuumLookOfValues(
  values: VacuumValues,
  online: boolean,
  finish: VacuumFinish = DEFAULT_VACUUM_FINISH,
): VacuumLook {
  if (!online) {
    return { ...RESTING_LOOK, online: false, scene: 'robot', finish };
  }
  const phase = vacuumPhase(values);
  const station = stationOf(values);
  const working = phase !== null && WORKING.includes(phase);
  return {
    ...RESTING_LOOK,
    finish,
    scene: working ? 'robot' : 'both',
    phase,
    station: station?.mode ?? null,
    stationProgress: progressShare(station?.progress),
    asleep: isAsleep(values),
    lidarUp: LIDAR_UP.includes(values.vacuum_lidar_status ?? null),
    cleanTank: cleanTankOf(values.vacuum_water_tank),
    dirtyTank: dirtyTankOf(values.vacuum_sewage_tank),
    bag: shareOf(values.vacuum_dust_bag_life),
    battery: shareOf(values.battery),
  };
}
