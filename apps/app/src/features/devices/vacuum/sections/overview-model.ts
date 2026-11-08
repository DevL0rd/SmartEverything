import {
  isVacuumTaskPhase,
  vacuumPhase,
  type JsonValue,
  type VacuumCleaningCommand,
  type VacuumPhase,
  type VacuumValues,
} from '@smarteverything/domain';
import type { IconName } from '../../../../components/icon';
import { duration } from '../../../../format/time';
import type { JobSummary } from '../model/job-summary';
import type { VacuumChip, VacuumChipKey } from '../model/phase-chip';
import { phaseLine } from '../model/phase-line';
import { startLabel } from '../model/room-selection';

const SEPARATOR = ' · ';

export type RowKey = VacuumCleaningCommand;

export interface RowAction {
  readonly key: RowKey;
  readonly label: string;
  readonly icon: IconName;
  readonly look: 'primary' | 'secondary' | 'danger';
}

const DOCK: RowAction = { key: 'dock', label: 'Dock', icon: 'home', look: 'secondary' };
const STOP: RowAction = { key: 'stop', label: 'Stop', icon: 'square', look: 'danger' };
const RESUME: RowAction = { key: 'resume', label: 'Resume', icon: 'play', look: 'primary' };
const PAUSE: RowAction = { key: 'pause', label: 'Pause', icon: 'pause', look: 'primary' };
const PAUSE_SIDE: RowAction = { ...PAUSE, look: 'secondary' };

const WORKING: readonly RowAction[] = [PAUSE, DOCK];
const PAUSED: readonly RowAction[] = [RESUME, DOCK, STOP];
const BACKING: readonly RowAction[] = [PAUSE_SIDE, STOP];

const ROWS: Readonly<Partial<Record<VacuumChipKey, readonly RowAction[]>>> = {
  cleaning: WORKING,
  mopping: WORKING,
  mapping: WORKING,
  paused: PAUSED,
  mapping_paused: PAUSED,
  returning: BACKING,
  washing_mop: BACKING,
  error: [DOCK],
};

const DOCKED: readonly VacuumChipKey[] = ['idle', 'docked_full', 'charging', 'asleep'];

export function primaryRowOf(chip: VacuumChip, selectedRooms: number): readonly RowAction[] {
  if (DOCKED.includes(chip.key)) {
    return [{ key: 'start', label: startLabel(selectedRooms, 0), icon: 'play', look: 'primary' }];
  }
  return ROWS[chip.key] ?? [];
}

export interface StatusStrip {
  readonly battery: number | null;
  readonly title: string;
  readonly detail: string | null;
  readonly progress: number | null;
}

export interface StripInput {
  readonly values: VacuumValues;
  readonly online: boolean;
  readonly stationProgress: number | null;
  readonly lastSeenMs: number | null;
  readonly roomName: string | null;
  readonly job: JobSummary | null;
}

function numberOf(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function detailOf(job: JobSummary): string | null {
  const parts = [job.title, job.elapsedSeconds === null ? null : duration(job.elapsedSeconds)];
  return parts.filter((part): part is string => part !== null).join(SEPARATOR);
}

function shareOf(percent: number | null): number | null {
  return percent === null ? null : Math.min(1, Math.max(0, percent / 100));
}

function offlineStrip(battery: number | null, title: string): StatusStrip {
  return {
    battery: null,
    title: battery === null ? title : `Last known ${String(Math.round(battery))}%`,
    detail: null,
    progress: null,
  };
}

export function stripTitle(input: Omit<StripInput, 'stationProgress'>): string {
  const { values, job } = input;
  return phaseLine({
    values,
    online: input.online,
    lastSeenMs: input.lastSeenMs,
    room: input.roomName,
    doneAreaM2: job?.doneAreaM2 ?? null,
    plannedAreaM2: job?.plannedAreaM2 ?? null,
    mapAreaM2: numberOf(values.vacuum_area),
  });
}

const RESTING: readonly (VacuumPhase | null)[] = ['idle', 'docked_full', 'charging'];

function restDetail(
  values: VacuumValues,
  atStation: boolean,
  lastClean: string | null,
): string | null {
  const resting = RESTING.includes(vacuumPhase(values));
  return atStation || !resting || lastClean === null ? null : lastClean;
}

export function stripOf(input: StripInput, lastClean: string | null = null): StatusStrip {
  const { values, job } = input;
  const battery = numberOf(values.battery);
  const title = stripTitle(input);
  if (!input.online) {
    return offlineStrip(battery, title);
  }
  const atStation = input.stationProgress !== null;
  const running = !atStation && isVacuumTaskPhase(vacuumPhase(values)) ? job : null;
  return {
    battery,
    title,
    detail: running === null ? restDetail(values, atStation, lastClean) : detailOf(running),
    progress: input.stationProgress ?? (running === null ? null : shareOf(running.progress)),
  };
}

export function lastSeenMsOf(at: string | undefined): number | null {
  const ms = at === undefined ? Number.NaN : Date.parse(at);
  return Number.isNaN(ms) ? null : ms;
}

export interface ShownFault {
  readonly title: string;
  readonly hint: string | null;
  readonly canHelp: boolean;
}

export function stageFaultOf(
  chip: VacuumChip,
  fault: ShownFault | null,
  title: string,
): ShownFault | null {
  if (chip.key !== 'error') {
    return null;
  }
  return fault ?? { title, hint: null, canHelp: false };
}
