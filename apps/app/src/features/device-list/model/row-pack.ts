import type { Device } from '../../../store/state';

export interface PackedRow {
  readonly key: string;
  readonly devices: readonly Device[];
}

export function packRows(devices: readonly Device[], perRow: number): readonly PackedRow[] {
  const rows: PackedRow[] = [];
  for (let index = 0; index < devices.length; index += perRow) {
    const shown = devices.slice(index, index + perRow);
    rows.push({ key: shown.map((device) => device.id).join(','), devices: shown });
  }
  return rows;
}

export function sameRow(left: PackedRow, right: PackedRow): boolean {
  return (
    left.key === right.key &&
    left.devices.length === right.devices.length &&
    left.devices.every((device, index) => device === right.devices[index])
  );
}
