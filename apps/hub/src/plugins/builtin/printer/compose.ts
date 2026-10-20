import type { PrinterActiveJob, SupplyForecast } from '@smarteverything/domain';
import type { PrinterDescription, PrinterStatus } from '@smarteverything/ipp';
import { dayKeyOf } from './clock';
import { monthSpend, perPageCost } from './cost';
import type { PrinterLedger } from './ledger';
import { buildModel, supplyKeysOf, type PrinterModel } from './model';
import type { PrinterRecord } from './records';

const WEEK_DAYS = 7;
const DAY_MS = 86_400_000;

export interface Composition {
  readonly record: PrinterRecord;
  readonly description: PrinterDescription;
  readonly status: PrinterStatus;
  readonly ledger: PrinterLedger;
  readonly online: boolean;
  readonly now: Date;
  readonly progress: number | null;
  readonly activeJob: PrinterActiveJob | null;
  readonly previous: PrinterModel | null;
}

function weekPages(ledger: PrinterLedger, now: Date): number {
  let pages = 0;
  for (let offset = 0; offset < WEEK_DAYS; offset += 1) {
    const day = ledger.day(dayKeyOf(new Date(now.getTime() - offset * DAY_MS), ledger.zone));
    pages += day.pages + (day.estimatedPages ?? 0);
  }
  return pages;
}

export function composeModel(input: Composition): PrinterModel {
  const { ledger, status, now } = input;
  const today = dayKeyOf(now, ledger.zone);
  const day = ledger.day(today);
  const keys = supplyKeysOf(status.supplies, input.record.slotKeys);
  const forecasts = new Map<string, SupplyForecast | null>(
    status.supplies.map((supply, index) => {
      const key = keys[index] ?? '';
      return [key, ledger.forecast(key, supply.consumed, now)] as const;
    }),
  );
  const cost = perPageCost(input.previous?.supplies ?? [], input.record.settings);
  return buildModel({
    record: input.record,
    description: input.description,
    status,
    online: input.online,
    pagesToday: day.pages + (day.estimatedPages ?? 0),
    pagesWeek: weekPages(ledger, now),
    jobProgress: input.progress,
    activeJob: input.activeJob,
    forecasts,
    costMonth: monthSpend(ledger.days(), today.slice(0, 7), cost),
    gapOpen: !input.online,
    observedAt: now.toISOString(),
  });
}
