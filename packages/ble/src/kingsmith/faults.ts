import type { TreadmillFamily } from '@smarteverything/domain';

export interface TreadmillFault {
  readonly code: string;
  readonly cause: string;
  readonly tip: string;
}

const POWER_OFF_TIP =
  'Switch the treadmill off at the power switch, wait about ten minutes, then switch it on again. If the code returns, contact Kingsmith support.';

const FAULTS: readonly (readonly [string, string])[] = [
  ['E01', 'The drive board receives no signal from the console.'],
  ['E02', 'The motor stalled.'],
  ['E03', 'The speed sensor failed.'],
  ['E05', 'The motor drew too much current.'],
  ['E06', 'The motor circuit is open.'],
  ['E10', 'The motor output is short-circuited.'],
  ['E13', 'The console receives no signal from the drive board.'],
];

const G15_MODEL = 'KS-G15';

function unknownCause(model: string | null): string {
  return model === G15_MODEL
    ? 'Unknown G15 fault code: the G15 reported a code that Kingsmith has not published.'
    : 'The treadmill reported a fault code this app does not know.';
}

export function faultOf(
  code: string,
  family: TreadmillFamily,
  model: string | null = null,
): TreadmillFault {
  const known = family === 'wilink' ? FAULTS.find(([name]) => name === code) : undefined;
  return { code, cause: known?.[1] ?? unknownCause(model), tip: POWER_OFF_TIP };
}

export const FAULT_CODES: readonly string[] = FAULTS.map(([code]) => code);
