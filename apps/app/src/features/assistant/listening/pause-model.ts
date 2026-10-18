import { PAUSE_CHOICES_MS, type PauseChoiceMs } from '@smarteverything/domain';

export interface PauseOption {
  readonly value: string;
  readonly label: string;
}

export const PAUSE_OPTIONS: readonly PauseOption[] = PAUSE_CHOICES_MS.map((ms) => ({
  value: String(ms),
  label: ms < 1000 ? `${String(ms)} ms` : `${String(ms / 1000)} s`,
}));

export function pauseHint(pauseMs: PauseChoiceMs): string {
  if (pauseMs <= 320)
    return 'Quick: a sentence ends at the first short break. Best for fast answers.';
  if (pauseMs <= 640) return 'Balanced: short thinking breaks stay inside one sentence.';
  return 'Patient: waits through long thinking breaks before a sentence ends.';
}

export function pauseOfValue(value: string): PauseChoiceMs {
  const found = PAUSE_CHOICES_MS.find((ms) => String(ms) === value);
  if (found === undefined) throw new Error(`${value} is not an end-of-speech pause`);
  return found;
}
