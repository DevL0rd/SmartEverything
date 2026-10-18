import type { LaundryValues } from '@smarteverything/domain';
import type { Cycle } from './cycles';

const DUE_DAYS = 30;
const DUE_CYCLES = 30;
const DAY_MS = 86_400_000;

export interface DrumClean {
  readonly lastAt: string | null;
  readonly due: boolean;
  readonly daysAgo: number | null;
}

export function drumCleanOf(cycles: readonly Cycle[], now: number): DrumClean {
  const index = cycles.findIndex(
    (cycle) => cycle.program === 'Drum clean' && cycle.outcome === 'completed',
  );
  const last = index < 0 ? undefined : cycles[index];
  if (last === undefined) {
    return { lastAt: null, due: cycles.length >= DUE_CYCLES, daysAgo: null };
  }
  const daysAgo = Math.max(0, Math.floor((now - Date.parse(last.finishedAt)) / DAY_MS));
  return { lastAt: last.finishedAt, due: daysAgo >= DUE_DAYS || index >= DUE_CYCLES, daysAgo };
}

export function drumCleanText(clean: DrumClean): string {
  if (clean.daysAgo === null) {
    return clean.due ? 'Not cleaned for a while · due' : 'No clean on record yet';
  }
  const when = clean.daysAgo === 0 ? 'today' : `${String(clean.daysAgo)} days ago`;
  return clean.due ? `Last cleaned ${when} · due` : `Last cleaned ${when}`;
}

export function countsText(washes: unknown, dries: unknown): string | null {
  const parts = [
    typeof washes === 'number' ? `${String(washes)} washes` : null,
    typeof dries === 'number' ? `${String(dries)} dries` : null,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}

export function isDue(values: LaundryValues, clean: DrumClean): boolean {
  const rinsing = typeof values.tank_clean_minutes === 'number' && values.tank_clean_minutes > 0;
  return (
    values.filter_clean === true ||
    values.detergent_level === 'Low' ||
    values.softener_level === 'Low' ||
    clean.due ||
    rinsing
  );
}
