import type { PrinterPowerState } from '@smarteverything/domain';
import { backoffDelay } from '../../backoff';
import type { PrinterSettings } from './settings';

const ASLEEP_SECONDS = 60;
const BUSY_LONGEST_MS = 300_000;
const OFFLINE_FIRST_MS = 1_000;

export interface CadenceInput {
  readonly settings: Pick<PrinterSettings, 'idleSeconds' | 'activeSeconds'>;
  readonly viewed: boolean;
  readonly active: boolean;
  readonly power: PrinterPowerState;
  readonly failures: number;
  readonly busyStreak: number;
  readonly authBlocked: boolean;
}

export function nextDelayMs(input: CadenceInput): number | null {
  if (input.authBlocked) return null;
  if (input.failures > 0) {
    return backoffDelay(input.failures - 1, {
      firstMs: OFFLINE_FIRST_MS,
      longestMs: BUSY_LONGEST_MS,
    });
  }
  if (input.busyStreak > 0) {
    const base = baseDelayMs(input);
    return Math.min(base * 2 ** input.busyStreak, BUSY_LONGEST_MS);
  }
  return baseDelayMs(input);
}

function baseDelayMs(input: CadenceInput): number {
  if (input.viewed || input.active) return input.settings.activeSeconds * 1000;
  if (input.power !== 'awake') return ASLEEP_SECONDS * 1000;
  return input.settings.idleSeconds * 1000;
}
