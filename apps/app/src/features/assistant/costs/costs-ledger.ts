import type { UsageLedgerRow } from '@smarteverything/domain';
import type { VirtualSection } from '../../../components/virtual-list';
import { dayLabel, localDayKey } from '../../../format/time';

export function ledgerSections(
  rows: readonly UsageLedgerRow[],
  now: number,
  timeZone: string,
): readonly VirtualSection<UsageLedgerRow>[] {
  const sections: { key: string; title: string; data: UsageLedgerRow[] }[] = [];
  for (const row of rows) {
    const key = localDayKey(row.at, timeZone);
    const last = sections.at(-1);
    if (last?.key === key) {
      last.data.push(row);
    } else {
      sections.push({ key, title: dayLabel(row.at, now, timeZone), data: [row] });
    }
  }
  return sections;
}
