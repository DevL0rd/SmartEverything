export const COLD_WORKLOADS = ['seq-read-cold', 'list-cold'] as const;
export const WARM_WORKLOADS = ['seq-read-warm', 'list-warm'] as const;
export const REST_WORKLOADS = [
  'seq-write',
  'rand-read-1',
  'rand-read-16',
  'rand-write-1',
  'rand-write-16',
  'create-1',
  'create-16',
  'create-32',
  'untar',
  'clone',
  'office-save',
  'rm-tree',
] as const;

export const SWEEP_VALUES = [12, 64, 128] as const;
export const SWEEP_WORKLOADS = [
  'seq-read-cold',
  'seq-read-warm',
  'seq-write',
  'rand-read-16',
  'rand-write-16',
  'create-16',
  'untar',
  'clone',
] as const;

export const DEFAULT_RUNS = 5;
export const SWEEP_RUNS = 3;

export interface Phases {
  readonly cold: readonly string[];
  readonly warm: readonly string[];
  readonly rest: readonly string[];
}

export interface Turn {
  readonly run: number;
  readonly kind: string;
}

export function phasesFor(selected: readonly string[] | null): Phases {
  const keep = (names: readonly string[]): readonly string[] =>
    selected === null ? names : names.filter((name) => selected.includes(name));
  return { cold: keep(COLD_WORKLOADS), warm: keep(WARM_WORKLOADS), rest: keep(REST_WORKLOADS) };
}

const DATASETS: readonly (readonly [string, string])[] = [
  ['seq-read', 'seq'],
  ['rand-', 'rand'],
  ['list-', 'list'],
  ['office-save', 'office'],
];

export function datasetsFor(phases: Phases): readonly string[] {
  const names = [...phases.cold, ...phases.warm, ...phases.rest];
  return DATASETS.filter(([prefix]) => names.some((name) => name.startsWith(prefix))).map(
    ([, dataset]) => dataset,
  );
}

export function allWorkloads(): readonly string[] {
  return [...COLD_WORKLOADS, ...WARM_WORKLOADS, ...REST_WORKLOADS];
}

export function checkSelection(selected: readonly string[]): void {
  const known = new Set(allWorkloads());
  const unknown = selected.filter((name) => !known.has(name));
  if (unknown.length > 0) throw new Error(`Unknown workload: ${unknown.join(', ')}.`);
  if (selected.includes('rm-tree') && !selected.includes('untar'))
    throw new Error('rm-tree removes the tree that untar extracts, so select untar with it.');
}

export function schedule(kinds: readonly string[], runs: number): readonly Turn[] {
  const turns: Turn[] = [];
  for (let run = 1; run <= runs; run += 1) {
    const shift = (run - 1) % kinds.length;
    const ordered = [...kinds.slice(shift), ...kinds.slice(0, shift)];
    for (const kind of ordered) turns.push({ run, kind });
  }
  return turns;
}

export function maxBackgroundKind(value: number): string {
  return `se-mb${String(value)}`;
}

export function parseSweepKind(kind: string): number | null {
  const match = /^se-mb(\d+)$/u.exec(kind);
  return match === null ? null : Number(match[1]);
}

export interface SweepScore {
  readonly value: number;
  readonly score: number;
}

export function bestMaxBackground(
  medians: ReadonlyMap<string, ReadonlyMap<string, number>>,
): SweepScore | null {
  const logs = new Map<number, { sum: number; count: number }>();
  for (const byKind of medians.values()) {
    const swept = [...byKind.entries()]
      .map(([kind, seconds]) => ({ value: parseSweepKind(kind), seconds }))
      .filter(
        (entry): entry is { value: number; seconds: number } =>
          entry.value !== null && entry.seconds > 0,
      );
    if (swept.length === 0) continue;
    const fastest = Math.min(...swept.map((entry) => entry.seconds));
    for (const entry of swept) {
      const own = logs.get(entry.value) ?? { sum: 0, count: 0 };
      logs.set(entry.value, {
        sum: own.sum + Math.log(entry.seconds / fastest),
        count: own.count + 1,
      });
    }
  }
  const scores = [...logs.entries()].map(([value, log]) => ({
    value,
    score: Math.exp(log.sum / log.count),
  }));
  scores.sort((left, right) => left.score - right.score || left.value - right.value);
  return scores[0] ?? null;
}
