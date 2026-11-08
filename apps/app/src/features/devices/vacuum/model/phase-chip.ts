import {
  VACUUM_STATUS_TABLE,
  isVacuumAwake,
  vacuumPhase,
  type VacuumPhase,
  type VacuumValues,
} from '@smarteverything/domain';
import type { IconName } from '../../../../components/icon';

export type VacuumTone =
  'working' | 'paused' | 'returning' | 'error' | 'docked' | 'idle' | 'offline';

export type VacuumChipKey = VacuumPhase | 'asleep' | 'offline' | 'unknown';

export interface VacuumChip {
  readonly key: VacuumChipKey;
  readonly tone: VacuumTone;
  readonly icon: IconName;
  readonly word: string;
  readonly awake: boolean;
}

interface ChipLook {
  readonly tone: VacuumTone;
  readonly icon: IconName;
  readonly word: string;
}

const PHASE_CHIPS: Readonly<Record<VacuumPhase, ChipLook>> = {
  idle: { tone: 'idle', icon: 'vacuum', word: 'Idle' },
  docked_full: { tone: 'docked', icon: 'circleCheck', word: 'Charged' },
  charging: { tone: 'docked', icon: 'plug', word: 'Charging' },
  cleaning: { tone: 'working', icon: 'vacuum', word: 'Cleaning' },
  mopping: { tone: 'working', icon: 'droplet', word: 'Mopping' },
  paused: { tone: 'paused', icon: 'pause', word: 'Paused' },
  returning: { tone: 'returning', icon: 'home', word: 'Returning' },
  washing_mop: { tone: 'returning', icon: 'droplet', word: 'Washing' },
  station_busy: { tone: 'working', icon: 'droplet', word: 'Station' },
  mapping: { tone: 'working', icon: 'route', word: 'Mapping' },
  mapping_paused: { tone: 'paused', icon: 'pause', word: 'Mapping paused' },
  remote: { tone: 'working', icon: 'remote', word: 'Remote' },
  error: { tone: 'error', icon: 'alert', word: 'Needs help' },
  updating: { tone: 'idle', icon: 'download', word: 'Updating' },
  self_check: { tone: 'idle', icon: 'wrench', word: 'Checking' },
  summoned: { tone: 'returning', icon: 'locate', word: 'Coming to you' },
};

const OFFLINE_CHIP: ChipLook = { tone: 'offline', icon: 'wifi', word: 'Offline' };
const ASLEEP_CHIP: ChipLook = { tone: 'docked', icon: 'moon', word: 'Asleep' };
const UNKNOWN_CHIP: ChipLook = { tone: 'idle', icon: 'vacuum', word: 'Unknown' };

const DOCKED_PHASES: readonly VacuumPhase[] = ['idle', 'docked_full', 'charging'];

export function vacuumStatusSpec(values: VacuumValues): string | null {
  const status = values.vacuum_status;
  if (status === undefined) {
    return null;
  }
  const entry =
    typeof status === 'number'
      ? VACUUM_STATUS_TABLE.find((row) => row.value === status)
      : VACUUM_STATUS_TABLE.find((row) => row.spec === status);
  return entry?.spec ?? null;
}

export function isDockedAsleep(values: VacuumValues): boolean {
  const phase = vacuumPhase(values);
  return values.vacuum_asleep === true && phase !== null && DOCKED_PHASES.includes(phase);
}

function chipFor(values: VacuumValues, online: boolean): readonly [VacuumChipKey, ChipLook] {
  if (!online) {
    return ['offline', OFFLINE_CHIP];
  }
  const phase = vacuumPhase(values);
  if (phase === null) {
    return ['unknown', UNKNOWN_CHIP];
  }
  return isDockedAsleep(values) ? ['asleep', ASLEEP_CHIP] : [phase, PHASE_CHIPS[phase]];
}

export function vacuumChipOf(values: VacuumValues, online: boolean): VacuumChip {
  const [key, look] = chipFor(values, online);
  return { key, ...look, awake: online && isVacuumAwake(values) };
}
