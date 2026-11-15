import { z } from 'zod';

const SHAPED = z.looseObject({ kind: z.string().optional(), run: z.number().optional() });

const RESULT = z.looseObject({
  workload: z.string(),
  seconds: z.number(),
  kind: z.string().optional(),
});

export function stampNow(date: Date): string {
  return date.toISOString().replace(/[-:]/gu, '').slice(0, 13).replace('T', '-');
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function collect(text: string): Map<string, Map<string, number[]>> {
  const grouped = new Map<string, Map<string, number[]>>();
  for (const line of text.split('\n').filter((entry) => entry.trim() !== '')) {
    const result = RESULT.parse(JSON.parse(line));
    const kind = result.kind ?? '';
    const kinds = grouped.get(result.workload) ?? new Map<string, number[]>();
    const values = kinds.get(kind) ?? [];
    values.push(result.seconds);
    kinds.set(kind, values);
    grouped.set(result.workload, kinds);
  }
  return grouped;
}

export function summary(text: string): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const medians = new Map<string, Map<string, number>>();
  for (const [workload, kinds] of collect(text))
    medians.set(
      workload,
      new Map([...kinds.entries()].map(([kind, values]) => [kind, median(values)])),
    );
  return medians;
}

export interface Shape {
  readonly kinds: readonly string[];
  readonly runs: number;
  readonly sweep: boolean;
}

export function shapeOf(text: string): Shape {
  const kinds = new Set<string>();
  let runs = 0;
  let sweep = false;
  for (const line of text.split('\n').filter((entry) => entry.trim() !== '')) {
    const result = SHAPED.parse(JSON.parse(line));
    const kind = result.kind ?? '';
    if (kind.startsWith('se-mb')) sweep = true;
    else kinds.add(kind);
    if (!kind.startsWith('se-mb')) runs = Math.max(runs, result.run ?? 0);
  }
  return { kinds: [...kinds].sort((left, right) => right.localeCompare(left)), runs, sweep };
}
