import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { appName } from '../../../format/health-apps';
import { joinParts } from '../../../format/text';
import { clock } from '../../../format/time';
import type { OtherRecord } from '../data/day-log';
import { amountText } from '../model/macros';
import { millilitres } from '../../../format/number';

function summary(record: OtherRecord): { readonly title: string; readonly value: string | null } {
  if (record.type === 'Hydration') {
    return { title: 'Water', value: millilitres(record.data.liters * 1000) };
  }
  const kcal = record.data.kilocalories;
  return {
    title: record.data.name ?? 'Food',
    value: kcal === null ? null : `${amountText(kcal, 'kcal')} kcal`,
  };
}

function footerOf(records: readonly OtherRecord[], counted: boolean): string {
  if (counted || records.every((record) => record.type === 'Hydration')) {
    return 'Counted in today’s totals. Change them in the app that logged them.';
  }
  return records.some((record) => record.type === 'Hydration')
    ? 'Water is counted in today’s totals. Food logged here is used. Change these in the app that logged them.'
    : 'Not counted today: what you log here is used. Change these in the app that logged them.';
}

export function OtherApps({
  records,
  counted,
}: {
  readonly records: readonly OtherRecord[];
  readonly counted: boolean;
}): ReactNode {
  if (records.length === 0) {
    return null;
  }
  return (
    <List title="From other apps" inset footer={footerOf(records, counted)}>
      {records.map((record) => {
        const shown = summary(record);
        return (
          <ListRow
            key={record.recordId}
            icon={record.type === 'Hydration' ? 'glassWater' : 'apple'}
            title={shown.title}
            subtitle={joinParts([appName(record.sourceApp), clock(record.startTime)])}
            {...(shown.value === null ? {} : { value: shown.value })}
          />
        );
      })}
    </List>
  );
}
