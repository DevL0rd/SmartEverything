import { z } from 'zod';
import type { CapabilityKey } from './capabilities';
import { LAUNDRY_DOOR_LINES, NO_FAULT, reportedFault } from './laundry-copy';
import { LAUNDRY_ROLES, type LaundryValueRole, type LaundryValues } from './laundry-roles';
import type { CapabilityRole } from './presentation/types';
import type { JsonValue } from './values';

export * from './laundry-roles';
export * from './laundry-programs';
export * from './laundry-copy';

export const LAUNDRY_STATUSES = [
  'Off',
  'Idle',
  'Paused',
  'Busy',
  'Delay',
  'Completed',
  'Clean Cavity Completed',
] as const;

export const LAUNDRY_RUN_STATUSES = [
  'Not Run',
  'Performing Scheduled Task',
  'Weighing',
  'Prewashing',
  'Steam Sterilization',
  'Soaking',
  'Washing',
  'Rinsing',
  'Anti-crease Soaking',
  'Spinning',
  'Drying',
  'Cooling After Drying',
  'Waiting Blow And Shake',
  'Blowing And Shaking',
  'Clothing Care',
  'Washing Completed',
] as const;

export const LAUNDRY_DOORS = [
  'Open',
  'Closed And Can Be Opened',
  'Closed And Can Not Be Opened',
  'Unopenable And Dry',
  'Unopenable And High Water Temperature',
  'Unopenable And High Water Level',
  'Unopenable And High Speed Level',
] as const;

export const LAUNDRY_PHASES = [
  'off',
  'idle',
  'delayed',
  'weighing',
  'prewash',
  'soak',
  'wash',
  'rinse',
  'spin',
  'dry',
  'cool',
  'anti_crease',
  'steam',
  'care',
  'paused',
  'finished',
  'drum_clean_done',
] as const;

export type LaundryPhase = (typeof LAUNDRY_PHASES)[number];

export const LAUNDRY_STAGES = ['rest', 'water', 'tumble', 'spin', 'heat', 'done', 'alert'] as const;

export type LaundryStage = (typeof LAUNDRY_STAGES)[number];

export type PlannedPhase = Exclude<
  LaundryPhase,
  'off' | 'idle' | 'delayed' | 'paused' | 'finished' | 'drum_clean_done'
>;

export class LaundryValueError extends Error {
  override readonly name = 'LaundryValueError';

  constructor(
    readonly role: string,
    readonly expected: string,
    readonly received: unknown,
  ) {
    super(`The washer's ${role} should be ${expected}. Received ${JSON.stringify(received)}.`);
  }
}

const STATUS_PHASES: Readonly<Record<(typeof LAUNDRY_STATUSES)[number], LaundryPhase | null>> = {
  Off: 'off',
  Idle: 'idle',
  Paused: 'paused',
  Busy: null,
  Delay: 'delayed',
  Completed: 'finished',
  'Clean Cavity Completed': 'drum_clean_done',
};

const RUN_PHASES: Readonly<Record<(typeof LAUNDRY_RUN_STATUSES)[number], LaundryPhase | null>> = {
  'Not Run': null,
  'Performing Scheduled Task': 'delayed',
  Weighing: 'weighing',
  Prewashing: 'prewash',
  'Steam Sterilization': 'steam',
  Soaking: 'soak',
  Washing: 'wash',
  Rinsing: 'rinse',
  'Anti-crease Soaking': 'soak',
  Spinning: 'spin',
  Drying: 'dry',
  'Cooling After Drying': 'cool',
  'Waiting Blow And Shake': 'anti_crease',
  'Blowing And Shaking': 'anti_crease',
  'Clothing Care': 'care',
  'Washing Completed': 'finished',
};

const PHASE_STAGES: Readonly<Record<LaundryPhase, LaundryStage>> = {
  off: 'rest',
  idle: 'rest',
  delayed: 'rest',
  paused: 'rest',
  weighing: 'tumble',
  prewash: 'water',
  soak: 'water',
  wash: 'water',
  rinse: 'water',
  spin: 'spin',
  dry: 'heat',
  cool: 'heat',
  anti_crease: 'tumble',
  steam: 'heat',
  care: 'heat',
  finished: 'done',
  drum_clean_done: 'done',
};

const PLANNED_ORDER: readonly PlannedPhase[] = [
  'weighing',
  'prewash',
  'steam',
  'soak',
  'wash',
  'rinse',
  'spin',
  'dry',
  'cool',
  'anti_crease',
  'care',
];

const PLANNED_BITS: Readonly<Record<number, PlannedPhase>> = {
  2: 'weighing',
  3: 'prewash',
  4: 'steam',
  5: 'soak',
  6: 'wash',
  7: 'rinse',
  8: 'soak',
  9: 'spin',
  10: 'dry',
  11: 'cool',
  12: 'anti_crease',
  13: 'anti_crease',
  14: 'care',
};

const PLANNED_MASK = z.number().int().nonnegative();

const FIRST_STARTED_PHASE: LaundryPhase = 'weighing';

function stringValue<const Options extends readonly string[]>(
  values: LaundryValues,
  role: LaundryValueRole,
  options: Options,
): Options[number] | undefined {
  const value = values[role];
  if (value === undefined) {
    return undefined;
  }
  const match = options.find((option) => option === value);
  if (match === undefined) {
    throw new LaundryValueError(role, options.join(' | '), value);
  }
  return match;
}

export function laundryRunPhase(values: LaundryValues): LaundryPhase | null {
  const run = stringValue(values, 'laundry_phase', LAUNDRY_RUN_STATUSES);
  return run === undefined ? null : RUN_PHASES[run];
}

export function laundryPhase(values: LaundryValues): LaundryPhase | null {
  const status = stringValue(values, 'laundry_status', LAUNDRY_STATUSES);
  if (status === undefined) {
    return null;
  }
  return STATUS_PHASES[status] ?? laundryRunPhase(values) ?? FIRST_STARTED_PHASE;
}

export function laundryStage(phase: LaundryPhase, hasFault = false): LaundryStage {
  return hasFault ? 'alert' : PHASE_STAGES[phase];
}

export function isLaundryRunning(phase: LaundryPhase): boolean {
  const stage = PHASE_STAGES[phase];
  return stage === 'water' || stage === 'tumble' || stage === 'spin' || stage === 'heat';
}

export function plannedPhases(mask: JsonValue | undefined): readonly PlannedPhase[] {
  if (mask === undefined) {
    return [];
  }
  const parsed = PLANNED_MASK.safeParse(mask);
  if (!parsed.success) {
    throw new LaundryValueError('laundry_phases', 'a non-negative whole number', mask);
  }
  const planned = new Set<PlannedPhase>();
  for (const [bit, phase] of Object.entries(PLANNED_BITS)) {
    if (Math.floor(parsed.data / 2 ** Number(bit)) % 2 === 1) {
      planned.add(phase);
    }
  }
  return PLANNED_ORDER.filter((phase) => planned.has(phase));
}

export function laundryFault(values: LaundryValues): string | null {
  const value = values.fault;
  if (value === undefined || value === NO_FAULT) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new LaundryValueError('fault', 'a fault name', value);
  }
  return value;
}

export function doorLine(door: string, phase: LaundryPhase): string {
  const line = Object.hasOwn(LAUNDRY_DOOR_LINES, door) ? LAUNDRY_DOOR_LINES[door] : undefined;
  if (line === undefined) {
    throw new LaundryValueError('door_state', LAUNDRY_DOORS.join(' | '), door);
  }
  const lockedForCycle = door === 'Closed And Can Not Be Opened' && isLaundryRunning(phase);
  return lockedForCycle ? 'Door locked · cycle running' : line;
}

export function doorReleaseAllowed(door: string, phase: LaundryPhase): boolean {
  return phase === 'paused' && door === 'Closed And Can Not Be Opened';
}

export function laundryReadiness(values: LaundryValues, online: boolean): string | null {
  if (!online) {
    return 'The washer is offline.';
  }
  if (values.power === false && values.remote_control === false) {
    return 'Switch on the machine and press its remote button.';
  }
  if (values.remote_control === false) {
    return 'Turn on remote control on the machine.';
  }
  const fault = laundryFault(values);
  if (fault !== null) {
    return `The machine reports a fault: ${reportedFault(fault).title}.`;
  }
  return stringValue(values, 'door_state', LAUNDRY_DOORS) === 'Open' ? 'Close the door.' : null;
}

const MINUTES_PER_HOUR = 60;

export function formatLaundryMinutes(minutes: number): string {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  if (hours === 0) {
    return `${String(rest)} min`;
  }
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}

const LAUNDRY_VALUE_ROLES: ReadonlySet<CapabilityRole> = new Set<CapabilityRole>([
  ...LAUNDRY_ROLES,
  'fault',
  'power',
  'child_lock',
]);

export function isLaundryValueRole(role: CapabilityRole | null): role is LaundryValueRole {
  return role !== null && LAUNDRY_VALUE_ROLES.has(role);
}

export interface LaundryRoleSource {
  readonly key: CapabilityKey;
  readonly role: CapabilityRole | null;
}

export function laundryValuesOf(
  capabilities: readonly LaundryRoleSource[],
  read: (key: CapabilityKey) => JsonValue | undefined,
): LaundryValues {
  const entries = capabilities.flatMap((capability) => {
    const value = read(capability.key);
    return isLaundryValueRole(capability.role) && value !== undefined
      ? [[capability.role, value] as const]
      : [];
  });
  return Object.fromEntries(entries);
}
