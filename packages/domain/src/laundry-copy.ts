import type { LaundryPhase } from './laundry';

export interface LaundryFault {
  readonly raw: string;
  readonly code: number;
  readonly title: string;
  readonly advice: string;
}

export interface LaundryFaultAdvice {
  readonly code: number;
  readonly title: string;
  readonly advice: string;
}

const SERVICE_ADVICE = 'Switch the machine off for a minute. If it returns, contact service';

function fault(raw: string, code: number, title: string, advice: string): LaundryFault {
  return { raw, code, title, advice };
}

function serviceFault(raw: string, code: number, title: string): LaundryFault {
  return fault(raw, code, title, `${SERVICE_ADVICE} (code E-${String(code)}).`);
}

const BOARD_FAULT = 'Motor Driver Board Communication Malfunction';

const BOARD_CODES: readonly number[] = [24, 25, 26, 27];

const MOTOR_CODES: readonly number[] = [8, 9, 10, 11, 12, 13, 14, 15, 23];

export const LAUNDRY_FAULTS: readonly LaundryFault[] = [
  fault(
    'Door Lock Malfunction',
    1,
    'Door lock problem',
    'Close the door firmly. If it will not lock, contact service (code E-1).',
  ),
  fault(
    'Water Intake Malfunction',
    2,
    'Water intake problem',
    'Check that the tap is open and the inlet hose is not kinked.',
  ),
  fault(
    'Water Draining Malfunction',
    3,
    'Draining problem',
    'Check the drain filter and hose for a blockage.',
  ),
  serviceFault('Water Level Sensor Malfunction', 4, 'Water level sensor problem'),
  fault(
    'Overflow Malfunction',
    5,
    'Overflow',
    'Switch the machine off, close the tap and check the drain hose. If it returns, contact service (code E-5).',
  ),
  serviceFault(BOARD_FAULT, 6, 'Control board problem'),
  serviceFault('Motor Fault', 7, 'Motor problem'),
  fault(
    'Dehydration Fault',
    16,
    'Unbalanced spin',
    'The load is unbalanced. Spread the laundry and run Spin.',
  ),
  serviceFault('Drying Heating Tube Malfunction', 17, 'Dryer heater problem'),
  serviceFault('Drying Fan Malfunction', 18, 'Dryer fan problem'),
  serviceFault('Drying Air Inlet NTC Malfunction', 19, 'Dryer air sensor problem'),
  serviceFault('Drying Air Outlet NTC Malfunction', 20, 'Dryer air sensor problem'),
  serviceFault('Water Weating Tube Malfunction', 21, 'Water heater problem'),
  serviceFault('Water Temperature Sensor Malfunction', 22, 'Water temperature sensor problem'),
  ...MOTOR_CODES.map((code) =>
    serviceFault(`Motor Fault (${String(code)})`, code, 'Motor problem'),
  ),
  ...BOARD_CODES.map((code) =>
    serviceFault(`${BOARD_FAULT} (${String(code)})`, code, 'Control board problem'),
  ),
];

export const NO_FAULT = 'No Faults';

const FAULTS_BY_RAW: ReadonlyMap<string, LaundryFault> = new Map(
  LAUNDRY_FAULTS.map((entry) => [entry.raw, entry]),
);

const UNKNOWN_FAULT_CODE = 0;

export function reportedFault(raw: string): LaundryFaultAdvice {
  const known = FAULTS_BY_RAW.get(raw);
  return known === undefined
    ? { code: UNKNOWN_FAULT_CODE, title: 'Machine fault', advice: `${SERVICE_ADVICE}.` }
    : { code: known.code, title: known.title, advice: known.advice };
}

export function faultAdvice(raw: string): LaundryFaultAdvice | null {
  return raw === NO_FAULT ? null : reportedFault(raw);
}

export const LAUNDRY_FAULT_OPTIONS: Readonly<Record<string, string>> = {
  [NO_FAULT]: 'No fault',
  ...Object.fromEntries(LAUNDRY_FAULTS.map((entry) => [entry.raw, entry.title])),
};

export const LAUNDRY_STATUS_OPTIONS: Readonly<Record<string, string>> = {
  Off: 'Off',
  Idle: 'Ready',
  Paused: 'Paused',
  Busy: 'Running',
  Delay: 'Delayed start',
  Completed: 'Done',
  'Clean Cavity Completed': 'Drum clean done',
};

export const LAUNDRY_RUN_STATUS_OPTIONS: Readonly<Record<string, string>> = {
  'Not Run': 'Not running',
  'Performing Scheduled Task': 'Waiting to start',
  Weighing: 'Weighing',
  Prewashing: 'Prewashing',
  'Steam Sterilization': 'Steam hygiene',
  Soaking: 'Soaking',
  Washing: 'Washing',
  Rinsing: 'Rinsing',
  'Anti-crease Soaking': 'Soaking',
  Spinning: 'Spinning',
  Drying: 'Drying',
  'Cooling After Drying': 'Cooling',
  'Waiting Blow And Shake': 'Tumbling to prevent creases',
  'Blowing And Shaking': 'Tumbling to prevent creases',
  'Clothing Care': 'Clothing care',
  'Washing Completed': 'Wash finished',
};

export const LAUNDRY_DOOR_LINES: Readonly<Record<string, string>> = {
  Open: 'Door open',
  'Closed And Can Be Opened': 'Door unlocked',
  'Closed And Can Not Be Opened': 'Door locked',
  'Unopenable And Dry': 'Door locked · drying',
  'Unopenable And High Water Temperature': 'Door locked · water too hot',
  'Unopenable And High Water Level': 'Door locked · water in drum',
  'Unopenable And High Speed Level': 'Door locked · drum spinning',
};

export const LAUNDRY_PHASE_STEP_LABELS: Readonly<Partial<Record<LaundryPhase, string>>> = {
  weighing: 'Weigh',
  prewash: 'Prewash',
  soak: 'Soak',
  wash: 'Wash',
  rinse: 'Rinse',
  spin: 'Spin',
  dry: 'Dry',
  cool: 'Cool',
  anti_crease: 'Anti-crease',
  steam: 'Steam',
  care: 'Care',
};

export const LAUNDRY_PHASE_WORDS: Readonly<Record<LaundryPhase, string>> = {
  off: 'Off',
  idle: 'Ready',
  delayed: 'Delayed start',
  weighing: 'Weighing',
  prewash: 'Prewashing',
  soak: 'Soaking',
  wash: 'Washing',
  rinse: 'Rinsing',
  spin: 'Spinning',
  dry: 'Drying',
  cool: 'Cooling',
  anti_crease: 'Tumbling to prevent creases',
  steam: 'Steam hygiene',
  care: 'Clothing care',
  paused: 'Paused',
  finished: 'Done',
  drum_clean_done: 'Drum clean done',
};

export const LAUNDRY_AMOUNT_OPTIONS: Readonly<Record<string, string>> = {
  Few: 'Less',
  Standard: 'Standard',
  Many: 'More',
  'Lots Of': 'Most',
};

export const LAUNDRY_DRY_MODE_OPTIONS: Readonly<Record<string, string>> = {
  None: 'Off',
  Smart: 'Sensor',
  Timed: 'Timed',
};

export const LAUNDRY_DRY_TARGET_OPTIONS: Readonly<Record<string, string>> = {
  Ironing: 'Iron-dry',
  'Wear Immediately': 'Wear now',
  Store: 'Cupboard-dry',
  Close: 'Off',
};

export const LAUNDRY_DELAY_OPTIONS: Readonly<Record<string, string>> = {
  None: 'Now',
  'Start Wash': 'Start at',
  'Finish Wash': 'Finish by',
};

export const LAUNDRY_LEVEL_OPTIONS: Readonly<Record<string, string>> = {
  Low: 'Low',
  Normal: 'OK',
};

export const LAUNDRY_TANK_OPTIONS: Readonly<Record<string, string>> = {
  'Laundry Detergent': 'Detergent tank',
  Softener: 'Softener tank',
};
