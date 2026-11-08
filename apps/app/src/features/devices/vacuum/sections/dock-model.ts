import {
  vacuumPhase,
  vacuumStation,
  type JsonValue,
  type VacuumPhase,
  type VacuumRole,
  type VacuumStationMode,
  type VacuumValues,
} from '@smarteverything/domain';
import type { BadgeTone } from '../../../../components/badge';
import type { IconName } from '../../../../components/icon';
import { duration } from '../../../../format/time';
import type { Reading } from '../model/readings';

const SECONDS_PER_MINUTE = 60;

export interface StationAction {
  readonly role: VacuumRole;
  readonly label: string;
  readonly icon: IconName;
  readonly look: 'secondary' | 'danger';
}

export interface StationState {
  readonly word: string;
  readonly icon: IconName;
  readonly busy: boolean;
  readonly progress: number | null;
  readonly stop: StationAction | null;
}

const STOP_WASH: StationAction = {
  role: 'vacuum_stop_roller_wash',
  label: 'Stop washing',
  icon: 'square',
  look: 'danger',
};

const STOP_DRY: StationAction = {
  role: 'vacuum_stop_dry',
  label: 'Stop drying',
  icon: 'square',
  look: 'danger',
};

export const START_ACTIONS: readonly StationAction[] = [
  { role: 'vacuum_empty_dust', label: 'Empty bin', icon: 'trash', look: 'secondary' },
  { role: 'vacuum_start_roller_wash', label: 'Wash mop', icon: 'droplet', look: 'secondary' },
  { role: 'vacuum_dry_mop', label: 'Dry mop', icon: 'fan', look: 'secondary' },
];

interface ModeLook {
  readonly word: string;
  readonly icon: IconName;
  readonly stop: StationAction | null;
}

const MODE_LOOKS: Readonly<Record<VacuumStationMode, ModeLook>> = {
  idle: { word: 'Idle', icon: 'circleCheck', stop: null },
  dry: { word: 'Drying the mop', icon: 'fan', stop: STOP_DRY },
  dust: { word: 'Emptying the bin', icon: 'trash', stop: null },
  wash_mop: { word: 'Washing the mop', icon: 'droplet', stop: STOP_WASH },
  cut_hair: { word: 'Clearing hair', icon: 'wrench', stop: null },
  air_dry: { word: 'Airing the mop', icon: 'fan', stop: STOP_DRY },
  rewash: { word: 'Washing the mop again', icon: 'droplet', stop: STOP_WASH },
};

function shareOf(percent: number | null): number | null {
  return percent === null ? null : Math.min(1, Math.max(0, percent / 100));
}

export function stationOf(values: VacuumValues): StationState | null {
  const station = vacuumStation(values);
  if (station === null) {
    return null;
  }
  const progress = shareOf(station.progress);
  if (station.mode === null) {
    return {
      word: `Station mode ${String(station.rawMode)}`,
      icon: 'info',
      busy: station.rawMode !== 0,
      progress,
      stop: null,
    };
  }
  const look = MODE_LOOKS[station.mode];
  return {
    word: look.word,
    icon: look.icon,
    busy: station.mode !== 'idle',
    progress: station.mode === 'idle' ? null : progress,
    stop: look.stop,
  };
}

export interface StationDisplay {
  readonly word: string;
  readonly icon: IconName;
  readonly busy: boolean;
  readonly progress: number | null;
}

export function stationDisplay(reading: Reading<StationState | null>): StationDisplay {
  if (!reading.ok) {
    return { word: 'Station status unreadable', icon: 'alert', busy: false, progress: null };
  }
  return reading.value ?? { word: 'No station status', icon: 'info', busy: false, progress: null };
}

const DOCKED_PHASES: readonly VacuumPhase[] = ['idle', 'docked_full', 'charging'];

export function blockedReason(input: {
  readonly online: boolean;
  readonly values: VacuumValues;
  readonly busy: boolean;
}): string | null {
  const phase = vacuumPhase(input.values);
  if (!input.online) {
    return 'The robot is offline';
  }
  if (phase === null || !DOCKED_PHASES.includes(phase)) {
    return 'The robot needs to be on the station';
  }
  return input.busy ? 'The station is busy' : null;
}

const MOP_MISSING = 'The mop is not installed';

export function actionBlockedReason(input: {
  readonly role: VacuumRole;
  readonly stationReason: string | null;
  readonly values: VacuumValues;
}): string | null {
  if (input.stationReason !== null) {
    return input.stationReason;
  }
  const washing = input.role === 'vacuum_start_roller_wash';
  return washing && input.values.vacuum_mop_attached === false ? MOP_MISSING : null;
}

export function dryLeftText(values: VacuumValues, station: StationState | null): string | null {
  const minutes = values.vacuum_dry_left;
  const drying = station?.stop?.role === 'vacuum_stop_dry';
  return drying && typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0
    ? `${duration(minutes * SECONDS_PER_MINUTE)} left`
    : null;
}

export interface TankLook {
  readonly word: string;
  readonly tone: BadgeTone;
  readonly icon: IconName;
}

const EMPTYING: readonly (readonly [number, string, TankLook])[] = [
  [0, 'Idle', { word: 'Idle', tone: 'neutral', icon: 'circle' }],
  [1, 'Empting', { word: 'Emptying', tone: 'info', icon: 'refresh' }],
  [2, 'Empting Completed', { word: 'Emptying done', tone: 'positive', icon: 'circleCheck' }],
  [3, 'Empting Failed', { word: 'Emptying failed', tone: 'critical', icon: 'circleX' }],
  [4, 'Not Installed', { word: 'Not installed', tone: 'neutral', icon: 'ban' }],
];

const UNKNOWN_TANK: TankLook = { word: 'Unknown', tone: 'neutral', icon: 'info' };

function isState(value: JsonValue | undefined, number: number, name: string): boolean {
  return value === number || value === name;
}

export function emptyingLook(value: JsonValue | undefined): TankLook {
  const row = EMPTYING.find(([number, name]) => isState(value, number, name));
  return row === undefined ? UNKNOWN_TANK : row[2];
}

export function sewageLook(value: JsonValue | undefined): TankLook {
  if (isState(value, 1, 'Full')) {
    return { word: 'Full', tone: 'critical', icon: 'alert' };
  }
  return isState(value, 0, 'Not Full')
    ? { word: 'Not full', tone: 'positive', icon: 'circleCheck' }
    : UNKNOWN_TANK;
}

export function waterLook(value: JsonValue | undefined): TankLook {
  if (isState(value, 1, 'Empty')) {
    return { word: 'Empty', tone: 'warning', icon: 'alert' };
  }
  return isState(value, 0, 'Not Empty')
    ? { word: 'Has water', tone: 'positive', icon: 'circleCheck' }
    : UNKNOWN_TANK;
}

export function isEmptying(value: JsonValue | undefined): boolean {
  return isState(value, 1, 'Empting');
}

export function isNotInstalled(value: JsonValue | undefined): boolean {
  return isState(value, 4, 'Not Installed');
}

export interface TankSpec {
  readonly role: VacuumRole;
  readonly label: string;
  readonly look: (value: JsonValue | undefined) => TankLook;
  readonly emptyRole: VacuumRole | null;
}

export const TANKS: readonly TankSpec[] = [
  { role: 'vacuum_water_tank', label: 'Clean water tank', look: waterLook, emptyRole: null },
  { role: 'vacuum_sewage_tank', label: 'Dirty water tank', look: sewageLook, emptyRole: null },
  {
    role: 'vacuum_station_water_tank',
    label: 'Station tank',
    look: emptyingLook,
    emptyRole: 'vacuum_empty_station_tank',
  },
  {
    role: 'vacuum_host_water_tank',
    label: 'Robot tank',
    look: emptyingLook,
    emptyRole: 'vacuum_empty_host_tank',
  },
];

export function reportedTanks(values: VacuumValues): readonly TankSpec[] {
  return TANKS.filter((tank) => values[tank.role] !== undefined);
}

export const SETTING_ROLES: readonly VacuumRole[] = [
  'vacuum_auto_dust',
  'vacuum_dust_frequency',
  'vacuum_auto_mop_dry',
  'vacuum_dry_time',
  'vacuum_mop_wash',
  'vacuum_mop_wash_frequency',
  'vacuum_mop_wash_by_time',
  'vacuum_mop_wash_water',
  'vacuum_hot_wash',
  'vacuum_wash_temperature',
  'vacuum_repeat_wash',
  'vacuum_roller_auto_wash',
  'vacuum_detergent_use',
  'vacuum_detergent_delivery',
  'vacuum_detergent_amount',
  'vacuum_detergent_reminder',
  'vacuum_water_level_remind',
];
