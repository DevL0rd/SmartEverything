import type { PrinterProblem } from '@smarteverything/domain';
import { slotLabel } from '@smarteverything/domain';
import type { PrinterLive, SupplyLive } from '../../../features/device-visuals';
import { daysLabel } from './format';

export type ChipTone = 'critical' | 'warning' | 'neutral' | 'positive';

export interface Chip {
  readonly key: string;
  readonly label: string;
  readonly tone: ChipTone;
}

export interface FixCard {
  readonly key: string;
  readonly title: string;
  readonly cause: string;
  readonly tone: 'critical' | 'warning';
  readonly part: PrinterProblem['part'] | null;
  readonly supply: SupplyLive | null;
}

function supplyTitle(supply: SupplyLive): string {
  const name = slotLabel(supply.detail.slot);
  if (!supply.detail.consumed)
    return supply.standing === 'out' ? 'Waste tank is full' : 'Waste tank is almost full';
  return supply.standing === 'out' ? `${name} is empty` : `${name} is low`;
}

function supplyCause(supply: SupplyLive): string {
  if (!supply.detail.consumed) return 'Have the waste tank replaced or serviced.';
  if (supply.standing === 'out') return 'Replace the cartridge to keep printing.';
  const days = daysLabel(supply.detail.daysLeft);
  return days === null
    ? 'Have a new cartridge ready.'
    : `About ${days.toLowerCase()} of ink at this pace. Have a new one ready.`;
}

export function chipsOf(live: PrinterLive): readonly Chip[] {
  const problems = live.attention.problems.map((problem): Chip => ({
    key: problem.keyword,
    label: problem.title,
    tone: problem.severity === 'error' ? 'critical' : 'warning',
  }));
  const supplies = live.supplies
    .filter((supply) => supply.standing === 'low' || supply.standing === 'out')
    .map((supply): Chip => ({
      key: `supply-${supply.detail.key}`,
      label: supplyTitle(supply),
      tone: supply.standing === 'out' ? 'critical' : 'warning',
    }));
  const queue: readonly Chip[] =
    live.queue === 'paused' ? [{ key: 'paused', label: 'Paused', tone: 'warning' }] : [];
  return [...problems, ...supplies, ...queue];
}

export function fixCardsOf(live: PrinterLive): readonly FixCard[] {
  const problems = live.attention.problems.map((problem): FixCard => ({
    key: problem.keyword,
    title: problem.title,
    cause: problem.cause,
    tone: problem.severity === 'error' ? 'critical' : 'warning',
    part: problem.part,
    supply: null,
  }));
  const supplies = live.supplies
    .filter((supply) => supply.standing === 'low' || supply.standing === 'out')
    .map((supply): FixCard => ({
      key: `supply-${supply.detail.key}`,
      title: supplyTitle(supply),
      cause: supplyCause(supply),
      tone: supply.standing === 'out' ? 'critical' : 'warning',
      part: supply.detail.consumed ? 'cartridge' : 'waste',
      supply,
    }));
  return [...problems, ...supplies];
}

export function lowestLine(live: PrinterLive): string | null {
  const { lowest } = live;
  if (lowest === null) return null;
  const { level } = lowest;
  if (level === null || (lowest.standing !== 'low' && lowest.standing !== 'out')) return null;
  return `Lowest: ${slotLabel(lowest.detail.slot)} ${String(Math.round(level))}%`;
}
