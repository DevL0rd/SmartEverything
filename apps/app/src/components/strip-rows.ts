import { widthClassOf } from '../design/size-class';

export interface StripColumns {
  readonly compact: number;
  readonly medium: number;
  readonly expanded: number;
}

export function stripColumnsAt(area: number, columns: StripColumns): number {
  const width = widthClassOf(area);
  if (width === 'compact') {
    return columns.compact;
  }
  return width === 'medium' ? columns.medium : columns.expanded;
}

const MIN_ROW = 2;

export function stripRows(count: number, columns: number): readonly number[] {
  if (count <= 0) {
    return [];
  }
  const widest = Math.max(1, columns);
  let rows = Math.ceil(count / widest);
  if (widest >= MIN_ROW && Math.floor(count / rows) < MIN_ROW && count >= MIN_ROW) {
    rows -= 1;
  }
  const base = Math.floor(count / rows);
  const wider = count % rows;
  return Array.from({ length: rows }, (_, index) => (index < wider ? base + 1 : base));
}

export function stripChunks<T>(items: readonly T[], columns: number): readonly (readonly T[])[] {
  let start = 0;
  return stripRows(items.length, columns).map((size) => {
    const row = items.slice(start, start + size);
    start += size;
    return row;
  });
}
