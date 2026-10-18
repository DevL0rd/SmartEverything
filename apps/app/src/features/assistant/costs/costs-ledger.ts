import type { UsageLedgerRow } from '@smarteverything/domain';
import type { VirtualSection } from '../../../components/virtual-list';
import { dayLabelOf, localDayKey } from '../../../format/time';
import { shiftDays } from './costs-range';
import { background } from '@smarteverything/logging';

export function ledgerSections(
  rows: readonly UsageLedgerRow[],
  today: string,
  timeZone: string,
): readonly VirtualSection<UsageLedgerRow>[] {
  const days = { today, yesterday: shiftDays(today, -1) };
  const sections: { key: string; title: string; data: UsageLedgerRow[] }[] = [];
  for (const row of rows) {
    const key = localDayKey(row.at, timeZone);
    const last = sections.at(-1);
    if (last?.key === key) {
      last.data.push(row);
    } else {
      sections.push({ key, title: dayLabelOf(row.at, days, timeZone), data: [row] });
    }
  }
  return sections;
}

export interface LedgerRetry {
  readonly data: unknown;
  readonly refetch: () => Promise<unknown>;
  readonly fetchNextPage: () => Promise<unknown>;
}

export function retryLedger(ledger: LedgerRetry): void {
  background(
    ledger.data === undefined ? ledger.refetch() : ledger.fetchNextPage(),
    'costs_ledger.background_failed',
  );
}
