import type { ProcessRow, ProcessWindow } from '@smarteverything/domain';
import { processKey } from '@smarteverything/domain';
import type { RankedEntry } from '../../../components/ranked-list';
import { decimal } from '../../../format/number';
import { plural } from '../../../format/text';

export const TOP_COUNT = 5;

export const TOP_WINDOW: ProcessWindow = {
  sort: 'cpu',
  order: 'descending',
  tree: true,
  gpu: false,
  offset: 0,
  limit: TOP_COUNT,
};

function cpuText(cpu: number): string {
  return `${decimal(cpu, 1)} %`;
}

export function topEntries(rows: readonly ProcessRow[]): readonly RankedEntry[] {
  const shown = rows.slice(0, TOP_COUNT);
  const busiest = Math.max(1, ...shown.map((row) => row.cpu));
  return shown.map((row) => {
    const helpers = row.descendants > 0 ? ` and ${plural(row.descendants, 'helper')}` : '';
    return {
      key: processKey(row),
      label: `${row.name}${helpers}`,
      value: cpuText(row.cpu),
      share: row.cpu / busiest,
      spoken: `${row.name}${helpers}, ${decimal(row.cpu, 1)} percent`,
    };
  });
}
