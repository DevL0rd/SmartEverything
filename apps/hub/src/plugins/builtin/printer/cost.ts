import { type PrinterDay } from '@smarteverything/domain';
import type { PrinterSettings } from './settings';

export interface PerPageCost {
  readonly mono: number | null;
  readonly colour: number | null;
}

interface PricedSupply {
  readonly key: string;
  readonly slot: string;
  readonly consumed: boolean;
  readonly kind: string;
}

export function perPageCost(
  supplies: readonly PricedSupply[],
  settings: Pick<PrinterSettings, 'prices'>,
): PerPageCost {
  let mono: number | null = null;
  let colour: number | null = null;
  for (const supply of supplies) {
    const price = settings.prices[supply.key];
    if (
      price === undefined ||
      !supply.consumed ||
      (supply.kind !== 'ink' && supply.kind !== 'toner')
    )
      continue;
    const perPage = price.price / price.yieldPages;
    colour = (colour ?? 0) + perPage;
    if (supply.slot === 'black') mono = (mono ?? 0) + perPage;
  }
  return { mono: mono ?? colour, colour };
}

export function monthSpend(
  days: readonly PrinterDay[],
  month: string,
  cost: PerPageCost,
): number | null {
  if (cost.mono === null && cost.colour === null) return null;
  let total = 0;
  for (const day of days) {
    if (!day.day.startsWith(month)) continue;
    total += day.mono * (cost.mono ?? 0) + day.color * (cost.colour ?? 0);
  }
  return Math.round(total * 100) / 100;
}
