import type { LedgerEntry } from '../../../store/state';

export interface LightCommands {
  readonly failed: boolean;
  readonly waiting: boolean;
}

export function lightCommandsOf(entries: readonly LedgerEntry[]): LightCommands {
  return {
    failed: entries.some((entry) => entry.failure !== null),
    waiting: entries.some((entry) => entry.failure === null),
  };
}
