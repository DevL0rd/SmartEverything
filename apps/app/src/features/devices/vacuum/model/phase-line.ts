import {
  vacuumPhase,
  vacuumStation,
  type VacuumPhase,
  type VacuumStationMode,
  type VacuumValues,
} from '@smarteverything/domain';
import { clock, duration } from '../../../../format/time';
import { isDockedAsleep, vacuumStatusSpec } from './phase-chip';
import { readingOf } from './readings';

export interface PhaseLineInput {
  readonly values: VacuumValues;
  readonly online: boolean;
  readonly lastSeenMs: number | null;
  readonly room: string | null;
  readonly doneAreaM2: number | null;
  readonly plannedAreaM2: number | null;
  readonly mapAreaM2: number | null;
}

const SEPARATOR = ' · ';

export const FAULT_LINE = 'Needs help';

const SPEC_LINES: Readonly<Record<string, string>> = {
  BreakCharging: 'Charging, then it continues',
  'Sweeping and Mopping': 'Vacuuming and mopping',
  Mopping: 'Mopping',
  GoChargeBreak: 'Going back to charge, then it continues',
  WashBreak: 'Going back to wash the mop',
  GoWash: 'Going back to wash the mop',
};

const STATION_PHASES: readonly VacuumPhase[] = [
  'idle',
  'docked_full',
  'charging',
  'station_busy',
  'washing_mop',
];

type LivePhase = Exclude<VacuumPhase, 'error'>;

const PHASE_LINES: Readonly<Record<LivePhase, string>> = {
  idle: 'Idle',
  docked_full: 'Docked · charged',
  charging: 'Charging',
  cleaning: 'Cleaning',
  mopping: 'Mopping',
  paused: 'Paused',
  returning: 'Going back to the dock',
  washing_mop: 'Going back to wash the mop',
  station_busy: 'Working at the dock',
  mapping: 'Mapping',
  mapping_paused: 'Mapping paused',
  remote: 'Remote control',
  updating: "Updating the robot's software",
  self_check: 'Checking itself',
  summoned: 'Coming to you',
};

function join(parts: readonly (string | null)[]): string {
  return parts.filter((part): part is string => part !== null).join(SEPARATOR);
}

function percent(value: number | null): string | null {
  return value === null ? null : `${String(Math.round(value))}%`;
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function areaPart(input: PhaseLineInput): string | null {
  const { doneAreaM2, plannedAreaM2 } = input;
  if (doneAreaM2 !== null && plannedAreaM2 !== null) {
    return `${String(Math.round(doneAreaM2))} of ${String(Math.round(plannedAreaM2))} m²`;
  }
  return percent(numeric(input.values.vacuum_progress));
}

function offlineLine(lastSeenMs: number | null): string {
  return lastSeenMs === null ? 'Not reachable.' : `Not reachable. Last seen ${clock(lastSeenMs)}.`;
}

function stationWords(
  mode: VacuumStationMode,
  progress: string | null,
  left: string | null,
): string | null {
  const words: Readonly<Record<VacuumStationMode, string | null>> = {
    idle: null,
    wash_mop: join(['Washing the mop', progress]),
    rewash: join(['Washing the mop again', progress]),
    dry: join(['Drying the mop', left]),
    air_dry: 'Airing the mop',
    dust: 'Emptying the bin',
    cut_hair: 'Clearing hair from the brush',
  };
  return words[mode];
}

const STATION_SHORT: Readonly<Record<VacuumStationMode, string | null>> = {
  idle: null,
  wash_mop: 'Washing',
  rewash: 'Washing again',
  dry: 'Drying',
  air_dry: 'Airing',
  dust: 'Emptying',
  cut_hair: 'Clearing hair',
};

interface StationNow {
  readonly mode: VacuumStationMode;
  readonly progress: string | null;
  readonly left: string | null;
}

function stationNow(values: VacuumValues): StationNow | null {
  const reading = readingOf(() => vacuumStation(values));
  const station = reading.ok ? reading.value : null;
  const mode = station?.mode ?? null;
  if (mode === null) {
    return null;
  }
  const dryLeft = numeric(values.vacuum_dry_left);
  const left = dryLeft === null || dryLeft <= 0 ? null : `${duration(dryLeft * 60)} left`;
  return { mode, progress: percent(station?.progress ?? null), left };
}

function stationLine(values: VacuumValues): string | null {
  const now = stationNow(values);
  return now === null ? null : stationWords(now.mode, now.progress, now.left);
}

export function stationPillOf(values: VacuumValues): string | null {
  const now = stationNow(values);
  const head = now === null ? null : STATION_SHORT[now.mode];
  if (now === null || head === null) {
    return null;
  }
  return join([head, now.mode === 'dry' ? now.left : now.progress]);
}

function specLine(spec: string | null): string | undefined {
  return spec === null ? undefined : SPEC_LINES[spec];
}

function workingLine(phase: LivePhase, spec: string | null, input: PhaseLineInput): string {
  const head = specLine(spec) ?? PHASE_LINES[phase];
  if (phase === 'paused' || phase === 'mapping_paused') {
    return join([head, input.room]);
  }
  if (phase === 'mapping') {
    const mapped = input.mapAreaM2;
    return join([head, mapped === null ? null : `${String(Math.round(mapped))} m² so far`]);
  }
  return join([head, input.room, areaPart(input)]);
}

function dockedLine(phase: LivePhase, spec: string | null, values: VacuumValues): string {
  if (phase !== 'charging') {
    return PHASE_LINES[phase];
  }
  return join([specLine(spec) ?? PHASE_LINES.charging, percent(numeric(values.battery))]);
}

const DOCKED_PHASES: readonly LivePhase[] = ['idle', 'docked_full', 'charging'];

const WORKING_PHASES: readonly LivePhase[] = [
  'cleaning',
  'mopping',
  'paused',
  'mapping',
  'mapping_paused',
];

function livePhaseLine(phase: LivePhase, input: PhaseLineInput): string {
  const spec = vacuumStatusSpec(input.values);
  if (DOCKED_PHASES.includes(phase)) {
    return dockedLine(phase, spec, input.values);
  }
  return WORKING_PHASES.includes(phase)
    ? workingLine(phase, spec, input)
    : (specLine(spec) ?? PHASE_LINES[phase]);
}

export function phaseLine(input: PhaseLineInput): string {
  if (!input.online) {
    return offlineLine(input.lastSeenMs);
  }
  const phase = vacuumPhase(input.values);
  if (phase === null) {
    return 'Status not reported yet';
  }
  if (phase === 'error') {
    return FAULT_LINE;
  }
  if (isDockedAsleep(input.values)) {
    return 'Docked · asleep';
  }
  const station = STATION_PHASES.includes(phase) ? stationLine(input.values) : null;
  return station ?? livePhaseLine(phase, input);
}
