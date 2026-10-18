export interface ListEntry {
  readonly id: string;
  readonly disabled?: boolean;
}

export type HighlightStep = 1 | -1;

function enabledIndexes(entries: readonly ListEntry[]): readonly number[] {
  return entries.flatMap((entry, index) => (entry.disabled === true ? [] : [index]));
}

export function edgeHighlight(
  entries: readonly ListEntry[],
  edge: 'first' | 'last',
): string | null {
  const enabled = enabledIndexes(entries);
  const index = edge === 'first' ? enabled[0] : enabled.at(-1);
  return index === undefined ? null : (entries[index]?.id ?? null);
}

export function stepHighlight(
  entries: readonly ListEntry[],
  current: string | null,
  step: HighlightStep,
  wrap: boolean,
): string | null {
  const at = entries.findIndex((entry) => entry.id === current);
  if (at < 0) {
    return edgeHighlight(entries, step === 1 ? 'first' : 'last');
  }
  const enabled = enabledIndexes(entries);
  const next =
    step === 1 ? enabled.find((index) => index > at) : enabled.findLast((index) => index < at);
  if (next !== undefined) {
    return entries[next]?.id ?? null;
  }
  return wrap ? edgeHighlight(entries, step === 1 ? 'first' : 'last') : current;
}

export function keepHighlight(
  entries: readonly ListEntry[],
  current: string | null,
): string | null {
  const entry = entries.find((candidate) => candidate.id === current);
  return entry === undefined || entry.disabled === true ? null : current;
}
