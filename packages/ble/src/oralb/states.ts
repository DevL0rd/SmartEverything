export const ORALB_STATES: Readonly<Record<number, string>> = {
  0: 'unknown',
  1: 'initializing',
  2: 'idle',
  3: 'running',
  4: 'charging',
  5: 'setup',
  6: 'flight_menu',
  7: 'charge_forbidden',
  8: 'selection_menu',
  9: 'session_summary',
  10: 'post_brushing_summary',
  113: 'final_test',
  114: 'pcb_test',
  115: 'sleeping',
  116: 'transport',
  117: 'calibration_test',
};

export const ORALB_HEAD_STATES: Readonly<Record<number, string>> = {
  0: 'on',
  1: 'reset',
  2: 'snooze',
  254: 'interval',
  255: 'off',
};

export const ORALB_PRESSURE_STATES: Readonly<Record<number, string>> = {
  0: 'low',
  1: 'normal',
  2: 'high',
};

export function oralbStateName(code: number): string | null {
  return ORALB_STATES[code] ?? null;
}

export function oralbHeadStateName(code: number): string | null {
  return ORALB_HEAD_STATES[code] ?? null;
}

export function oralbPressureName(code: number): string | null {
  return ORALB_PRESSURE_STATES[code] ?? null;
}
