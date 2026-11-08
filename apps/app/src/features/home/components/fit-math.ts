export function columnsIn(width: number, minItem: number, gap: number, max: number): number {
  return Math.max(1, Math.min(max, Math.floor((width + gap) / (minItem + gap))));
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

export function rowsThatFit(room: number, minRow: number, gap: number): number {
  return Math.max(1, Math.floor((room + gap) / (minRow + gap)));
}

export interface GridSpace {
  readonly columns: number;
  readonly room: number;
  readonly minRow: number;
  readonly gap: number;
  readonly link: number;
}

export function linkedCapacity({ columns, room, minRow, gap, link }: GridSpace): number {
  return rowsThatFit(room - link - gap, minRow, gap) * columns;
}

export interface GridFit {
  readonly shown: number;
  readonly more: boolean;
}

export function gridFit(count: number, space: GridSpace): GridFit {
  const { columns, room, minRow, gap } = space;
  if (count <= rowsThatFit(room, minRow, gap) * columns) {
    return { shown: count, more: false };
  }
  return { shown: linkedCapacity(space), more: true };
}
