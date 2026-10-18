import type { HistoryRow } from '@smarteverything/domain';

export interface OnSegment {
  readonly start: number;
  readonly end: number;
  readonly state: 'on';
}

export function onSegments(
  rows: readonly HistoryRow[],
  window: { readonly from: number; readonly to: number },
): readonly OnSegment[] {
  const found: OnSegment[] = [];
  let since: number | null = null;
  const ordered = [...rows].sort(
    (left, right) => Date.parse(left.observed_at) - Date.parse(right.observed_at),
  );
  if (ordered[0]?.value === false) {
    since = window.from;
  }
  for (const row of ordered) {
    const at = Math.max(window.from, Date.parse(row.observed_at));
    if (row.value === true && since === null) {
      since = at;
    } else if (row.value === false && since !== null) {
      found.push({ start: since, end: at, state: 'on' });
      since = null;
    }
  }
  if (since !== null) {
    found.push({ start: since, end: window.to, state: 'on' });
  }
  return found;
}

export function wattsText(watts: number): string {
  return String(Math.round(watts));
}
