export interface FitInput {
  readonly ends: readonly (number | undefined)[];
  readonly room: number | null;
  readonly moreSpan: number | undefined;
}

export function fittingCount({ ends, room, moreSpan }: FitInput): number {
  const known = ends.flatMap((end) => (end === undefined ? [] : [end]));
  if (room === null || moreSpan === undefined || known.length < ends.length) return ends.length;
  const last = known.at(-1);
  if (last === undefined || last <= room) return known.length;
  for (let count = known.length - 1; count > 0; count -= 1) {
    const end = known[count - 1];
    if (end !== undefined && end + moreSpan <= room) return count;
  }
  return 0;
}

export function endsOf(widths: readonly (number | undefined)[]): readonly (number | undefined)[] {
  let sum = 0;
  return widths.map((width) => {
    if (width === undefined) return undefined;
    sum += width;
    return sum;
  });
}
