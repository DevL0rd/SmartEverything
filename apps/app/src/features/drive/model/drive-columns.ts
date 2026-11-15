export interface DriveColumn<K extends string> {
  readonly key: K;
  readonly title: string;
  readonly width: number;
  readonly maxWidth?: number;
  readonly optional?: boolean;
  readonly end?: boolean;
}

export interface PlacedColumn<K extends string> {
  readonly key: K;
  readonly title: string;
  readonly width: number;
  readonly end: boolean;
}

export const ROW_CHROME = 124;

export const NAME_MIN = 240;

export const COLUMN_GAP = 16;

function placed<K extends string>(
  room: number,
  columns: readonly DriveColumn<K>[],
): readonly PlacedColumn<K>[] | null {
  const least = columns.reduce((sum, column) => sum + column.width, 0);
  const gaps = COLUMN_GAP * Math.max(0, columns.length - 1);
  let spare = room - least - gaps;
  if (spare < 0) return null;
  return columns.map((column) => {
    const grow = Math.min(spare, (column.maxWidth ?? column.width) - column.width);
    spare -= grow;
    return {
      key: column.key,
      title: column.title,
      width: column.width + grow,
      end: column.end ?? false,
    };
  });
}

export function placeColumns<K extends string>(
  rowWidth: number,
  columns: readonly DriveColumn<K>[],
): readonly PlacedColumn<K>[] | null {
  const room = rowWidth - ROW_CHROME - NAME_MIN;
  return (
    placed(room, columns) ??
    placed(
      room,
      columns.filter((column) => column.optional !== true),
    )
  );
}

export function hasColumn<K extends string>(
  columns: readonly PlacedColumn<K>[] | null,
  key: K,
): boolean {
  return columns !== null && columns.some((column) => column.key === key);
}
