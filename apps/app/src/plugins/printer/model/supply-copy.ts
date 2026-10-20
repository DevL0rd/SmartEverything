import {
  slotCode,
  slotLabel,
  type PrinterSupplyDetail,
  type SupplyStanding,
} from '@smarteverything/domain';
import { daysLabel } from './format';

export interface SupplyCopy {
  readonly value: string;
  readonly caption: string;
  readonly code: string;
  readonly name: string;
  readonly aria: string;
}

function nameOf(detail: PrinterSupplyDetail): string {
  return detail.name === '' ? slotLabel(detail.slot) : detail.name;
}

function captionOf(
  detail: PrinterSupplyDetail,
  level: number | null,
  standing: SupplyStanding,
): string {
  if (level === null) return 'No level from the printer';
  const days = daysLabel(detail.daysLeft);
  if (!detail.consumed) {
    if (standing === 'out') return 'Full';
    return days === null ? 'Fills slowly' : `${days} to full`;
  }
  if (level <= 0) return 'Empty';
  return days === null ? (standing === 'low' ? 'Running low' : 'Plenty left') : `${days} left`;
}

export function supplyCopy(
  detail: PrinterSupplyDetail,
  level: number | null,
  standing: SupplyStanding,
): SupplyCopy {
  const name = nameOf(detail);
  const value = level === null ? 'Not reported' : `${String(Math.round(level))}%`;
  const caption = captionOf(detail, level, standing);
  const state =
    standing === 'low'
      ? ', low'
      : standing === 'out'
        ? detail.consumed
          ? ', empty'
          : ', full'
        : '';
  const aria =
    level === null
      ? `${name}, not reported`
      : `${name}, ${String(Math.round(level))} percent${detail.consumed ? '' : ' full'}${state}`;
  return { value, caption, code: slotCode(detail.slot), name, aria };
}
