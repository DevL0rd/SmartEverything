import type { SetupFacts } from './facts';
import { SETUP_ITEMS, type SetupItem, type SetupItemId } from './items';

export type SetupState = 'done' | 'todo' | 'skipped';

export interface ReadinessEntry {
  readonly item: SetupItem;
  readonly state: SetupState;
}

export interface Readiness {
  readonly entries: readonly ReadinessEntry[];
  readonly counted: readonly ReadinessEntry[];
  readonly done: number;
  readonly total: number;
  readonly ready: boolean;
  readonly next: ReadinessEntry | null;
}

function entryOf(
  item: SetupItem,
  facts: SetupFacts,
  skipped: readonly SetupItemId[],
): ReadinessEntry | null {
  const raw = item.stateOf(facts);
  if (raw === 'not_applicable') return null;
  if (raw === 'todo' && skipped.includes(item.id)) return { item, state: 'skipped' };
  return { item, state: raw };
}

const counts = (entry: ReadinessEntry): boolean =>
  entry.item.priority !== 'optional' && entry.state !== 'skipped';

export function readinessOf(facts: SetupFacts, skipped: readonly SetupItemId[]): Readiness {
  const entries = SETUP_ITEMS.filter((item) => facts.owner || !item.owner).flatMap((item) => {
    const entry = entryOf(item, facts, skipped);
    return entry === null ? [] : [entry];
  });
  const counted = entries.filter(counts);
  const done = counted.filter((entry) => entry.state === 'done').length;
  return {
    entries,
    counted,
    done,
    total: counted.length,
    ready: done === counted.length,
    next: counted.find((entry) => entry.state === 'todo') ?? null,
  };
}

export function readinessLine(readiness: Readiness): string {
  if (readiness.next === null) return 'Everything you set up is working.';
  return `Next: ${readiness.next.item.title}`;
}
