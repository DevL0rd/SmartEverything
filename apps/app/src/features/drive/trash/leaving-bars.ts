import type { DriveStats } from '@smarteverything/domain';
import type { BarShape } from '../../../components/charts/bar-marks';
import { barSlots } from '../../../components/charts/bar-path';
import { bytes } from '../../../format/number';
import { monthLabel } from './trash-model';

export type LeavingMonth = DriveStats['purges'][number];

export const BARS_HEIGHT = 56;
const RADIUS = 3;
const GAP_SHARE = 0.25;
const SEGMENT_GAP = 2;

export interface LeavingFills {
  readonly trash: string;
  readonly versions: string;
}

function monthShapes(
  month: LeavingMonth,
  slot: { readonly x: number; readonly width: number },
  unit: number,
  fills: LeavingFills,
): BarShape[] {
  const base = BARS_HEIGHT;
  const trashTop = base - month.trashBytes * unit;
  const shapes: BarShape[] = [];
  if (month.trashBytes > 0) {
    shapes.push({
      key: `${month.month}-trash`,
      ...slot,
      top: Math.min(base - 1, trashTop),
      bottom: base,
      radii: { top: month.versionBytes > 0 ? 0 : RADIUS, bottom: 0 },
      opacity: 1,
      fill: fills.trash,
    });
  }
  if (month.versionBytes > 0) {
    const bottom = month.trashBytes > 0 ? trashTop - SEGMENT_GAP : base;
    shapes.push({
      key: `${month.month}-versions`,
      ...slot,
      top: Math.min(bottom - 1, bottom - month.versionBytes * unit),
      bottom,
      radii: { top: RADIUS, bottom: 0 },
      opacity: 1,
      fill: fills.versions,
    });
  }
  return shapes;
}

export function leavingShapes(
  months: readonly LeavingMonth[],
  width: number,
  fills: LeavingFills,
): readonly BarShape[] {
  const slots = barSlots(months.length, width, { gap: GAP_SHARE, min: 1 });
  const peak = Math.max(1, ...months.map((month) => month.trashBytes + month.versionBytes));
  const unit = (BARS_HEIGHT - SEGMENT_GAP) / peak;
  return months.flatMap((month, index) => {
    const slot = slots[index];
    return slot === undefined ? [] : monthShapes(month, slot, unit, fills);
  });
}

export function leavingTotals(months: readonly LeavingMonth[]): {
  readonly trash: number;
  readonly versions: number;
} {
  return {
    trash: months.reduce((sum, month) => sum + month.trashBytes, 0),
    versions: months.reduce((sum, month) => sum + month.versionBytes, 0),
  };
}

export function leavingLabel(months: readonly LeavingMonth[]): string {
  const parts = months
    .filter((month) => month.trashBytes + month.versionBytes > 0)
    .map(
      (month) =>
        `${monthLabel(month.month)}: trash ${bytes(month.trashBytes)}, versions ${bytes(month.versionBytes)}`,
    );
  return parts.length === 0
    ? 'Nothing leaves for good in the coming months'
    : `Leaving for good each month. ${parts.join('; ')}`;
}
