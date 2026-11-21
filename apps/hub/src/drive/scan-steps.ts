import { ScanStepError, type ScanEntry } from './scanner-drafts';
import type { WalkEntry } from './scanner-walk';

export const SCAN_STEP_MS = 20;

export type ScanSettled =
  { readonly done: false } | { readonly done: true; readonly wanted: readonly WalkEntry[] };

export type ScanWork = () => void;

export interface Waiting {
  readonly entry: ScanEntry;
  readonly hashed: boolean;
}

export interface Placing {
  readonly entry: ScanEntry;
  readonly sha256: string | null;
}

export function placingOf(
  waiting: readonly Waiting[],
  hashes: readonly (string | null)[],
): readonly Placing[] {
  const wanted = waiting.filter((entry) => entry.hashed).length;
  if (hashes.length !== wanted) {
    throw new ScanStepError(
      `The scan asked for ${String(wanted)} hashes and got ${String(hashes.length)}.`,
    );
  }
  let next = 0;
  return waiting.map(({ entry, hashed }) => {
    const sha256 = hashed ? hashes[next] : null;
    if (sha256 === undefined) throw new ScanStepError(`The scan has no hash for ${entry.relPath}.`);
    if (hashed) next += 1;
    return { entry, sha256 };
  });
}

export type ScanWriter = <T>(work: () => T) => T;

export function stepBudget(): () => boolean {
  const began = performance.now();
  return () => performance.now() - began < SCAN_STEP_MS;
}

export function stepped<T>(
  items: readonly T[],
  from: number,
  write: ScanWriter,
  step: (item: T) => ScanWork | null,
): number {
  const within = stepBudget();
  let next = from;
  const take = (): ScanWork | null => {
    const item = items[next];
    if (item === undefined) throw new ScanStepError(`The scan has no step ${String(next)}.`);
    next += 1;
    return step(item);
  };
  while (next < items.length && (next === from || within())) {
    const work = take();
    if (work !== null) {
      write(() => {
        work();
        while (next < items.length && within()) take()?.();
      });
    }
  }
  return next;
}
