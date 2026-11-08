export const VACUUM_PHASES = [
  'idle',
  'docked_full',
  'charging',
  'cleaning',
  'mopping',
  'paused',
  'returning',
  'washing_mop',
  'station_busy',
  'mapping',
  'mapping_paused',
  'remote',
  'error',
  'updating',
  'self_check',
  'summoned',
] as const;

export type VacuumPhase = (typeof VACUUM_PHASES)[number];

export interface VacuumStatusEntry {
  readonly value: number;
  readonly spec: string;
  readonly phase: VacuumPhase;
}

export const VACUUM_STATUS_TABLE: readonly VacuumStatusEntry[] = [
  { value: 1, spec: 'Idle', phase: 'idle' },
  { value: 2, spec: 'Charging', phase: 'charging' },
  { value: 3, spec: 'BreakCharging', phase: 'charging' },
  { value: 4, spec: 'Sweeping', phase: 'cleaning' },
  { value: 5, spec: 'Paused', phase: 'paused' },
  { value: 6, spec: 'Go Charging', phase: 'returning' },
  { value: 7, spec: 'GoWash', phase: 'washing_mop' },
  { value: 8, spec: 'Remote', phase: 'remote' },
  { value: 9, spec: 'Charged', phase: 'docked_full' },
  { value: 10, spec: 'BuildingMap', phase: 'mapping' },
  { value: 11, spec: 'Updating', phase: 'updating' },
  { value: 12, spec: 'MultiTaskStationWorking', phase: 'station_busy' },
  { value: 13, spec: 'MultiTaskRecharge', phase: 'returning' },
  { value: 14, spec: 'StationWorking', phase: 'station_busy' },
  { value: 15, spec: 'Error', phase: 'error' },
  { value: 16, spec: 'Sweeping and Mopping', phase: 'cleaning' },
  { value: 17, spec: 'Mopping', phase: 'mopping' },
  { value: 18, spec: 'MappingPause', phase: 'mapping_paused' },
  { value: 19, spec: 'GoChargeBreak', phase: 'returning' },
  { value: 20, spec: 'WashBreak', phase: 'returning' },
  { value: 21, spec: 'GoChargeBuildingMap', phase: 'returning' },
  { value: 24, spec: 'GoChargeInStationAssistingCleaning', phase: 'returning' },
  { value: 25, spec: 'SelfChecking', phase: 'self_check' },
  { value: 26, spec: 'Summoning', phase: 'summoned' },
  { value: 27, spec: 'SweepSummoning', phase: 'cleaning' },
];

export const VACUUM_TASK_PHASES: readonly VacuumPhase[] = [
  'cleaning',
  'mopping',
  'paused',
  'returning',
  'washing_mop',
  'station_busy',
  'mapping',
  'mapping_paused',
  'remote',
  'summoned',
];

export function isVacuumTaskPhase(phase: VacuumPhase | null): boolean {
  return phase !== null && VACUUM_TASK_PHASES.includes(phase);
}

export const VACUUM_CLEANING_READINGS = [
  'idle',
  'charging',
  'docked',
  'cleaning',
  'paused',
  'returning',
  'servicing',
  'mapping',
  'remote',
  'updating',
  'error',
  'checking',
  'summoning',
] as const;

export type VacuumCleaningReading = (typeof VACUUM_CLEANING_READINGS)[number];

export const VACUUM_CLEANING_COMMANDS = ['start', 'pause', 'resume', 'dock', 'stop'] as const;

export type VacuumCleaningCommand = (typeof VACUUM_CLEANING_COMMANDS)[number];

export const VACUUM_CLEANING_OPTIONS: readonly string[] = [
  ...VACUUM_CLEANING_READINGS,
  ...VACUUM_CLEANING_COMMANDS,
];

const PHASE_READINGS: Readonly<Record<VacuumPhase, VacuumCleaningReading>> = {
  idle: 'idle',
  docked_full: 'docked',
  charging: 'charging',
  cleaning: 'cleaning',
  mopping: 'cleaning',
  paused: 'paused',
  returning: 'returning',
  washing_mop: 'returning',
  station_busy: 'servicing',
  mapping: 'mapping',
  mapping_paused: 'paused',
  remote: 'remote',
  error: 'error',
  updating: 'updating',
  self_check: 'checking',
  summoned: 'summoning',
};

export function vacuumCleaningReading(phase: VacuumPhase): VacuumCleaningReading {
  return PHASE_READINGS[phase];
}

export function isVacuumCleaningCommand(option: string): option is VacuumCleaningCommand {
  return VACUUM_CLEANING_COMMANDS.some((command) => command === option);
}

export const VACUUM_CLEANING_RESULTS: Readonly<
  Record<VacuumCleaningCommand, readonly VacuumCleaningReading[]>
> = {
  start: ['cleaning', 'servicing'],
  pause: ['paused'],
  resume: ['cleaning', 'returning', 'servicing'],
  dock: ['returning', 'charging', 'docked'],
  stop: ['idle', 'charging', 'docked'],
};

export function isVacuumCleaningResult(command: string, reading: unknown): boolean {
  return (
    isVacuumCleaningCommand(command) &&
    VACUUM_CLEANING_RESULTS[command].some((result) => result === reading)
  );
}

export const VACUUM_SCOPES = [
  { value: 1, spec: 'Global', scope: 'global' },
  { value: 2, spec: 'Zone', scope: 'zone' },
  { value: 3, spec: 'Area', scope: 'rooms' },
  { value: 4, spec: 'Edge', scope: 'edge' },
  { value: 5, spec: 'Costum', scope: 'custom' },
  { value: 6, spec: 'Point', scope: 'point' },
  { value: 7, spec: 'Custom Area', scope: 'custom_area' },
  { value: 8, spec: 'Appointment', scope: 'appointment' },
  { value: 9, spec: 'Linkage', scope: 'linkage' },
  { value: 10, spec: 'Fast', scope: 'fast' },
  { value: 11, spec: 'AI Hosting', scope: 'ai_hosting' },
] as const;

export type VacuumScope = (typeof VACUUM_SCOPES)[number]['scope'];

export const VACUUM_MODES = [
  { value: 1, spec: 'Sweep', mode: 'sweep' },
  { value: 3, spec: 'Sweep Mop', mode: 'sweep_mop' },
  { value: 4, spec: 'Sweep Before Mopping', mode: 'sweep_then_mop' },
] as const;

export type VacuumMode = (typeof VACUUM_MODES)[number]['mode'];

export const VACUUM_SWEEP_MOP_STATES = [
  { value: 0, spec: 'Idle', state: 'idle' },
  { value: 1, spec: 'Sweeping', state: 'sweeping' },
  { value: 2, spec: 'Mopping', state: 'mopping' },
] as const;

export type VacuumSweepMopState = (typeof VACUUM_SWEEP_MOP_STATES)[number]['state'];

export const VACUUM_CHARGING_STATES = [
  { value: 1, spec: 'Charging', state: 'charging' },
  { value: 2, spec: 'Not Charging', state: 'not_charging' },
  { value: 3, spec: 'Not Chargeable', state: 'not_chargeable' },
] as const;

export type VacuumChargingState = (typeof VACUUM_CHARGING_STATES)[number]['state'];

export const VACUUM_STATION_MODES = [
  { value: 0, mode: 'idle' },
  { value: 1, mode: 'dry' },
  { value: 2, mode: 'dust' },
  { value: 3, mode: 'wash_mop' },
  { value: 4, mode: 'cut_hair' },
  { value: 5, mode: 'air_dry' },
  { value: 7, mode: 'rewash' },
] as const;

export type VacuumStationMode = (typeof VACUUM_STATION_MODES)[number]['mode'];
