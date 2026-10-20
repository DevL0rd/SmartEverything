import type { BottleSourceParts } from '@smarteverything/domain';
import { millilitres, percent } from '../../../format/number';
import { SOURCE_LABEL } from './bottle-colours';

type SourceKey = keyof typeof SOURCE_LABEL;

export interface SourceRow {
  readonly key: SourceKey;
  readonly ml: number;
  readonly share: number;
}

const ORDER: readonly (readonly [SourceKey, keyof BottleSourceParts])[] = [
  ['bottle', 'bottleMl'],
  ['logged', 'loggedMl'],
  ['other', 'otherMl'],
];

export function sourceRows(parts: BottleSourceParts): readonly SourceRow[] {
  const total = parts.bottleMl + parts.loggedMl + parts.otherMl;
  return ORDER.flatMap(([key, field]) =>
    parts[field] > 0
      ? [{ key, ml: parts[field], share: total > 0 ? parts[field] / total : 0 }]
      : [],
  );
}

export function sourceSummary(parts: BottleSourceParts): string {
  const rows = sourceRows(parts);
  if (rows.length === 0) {
    return 'No water recorded.';
  }
  return `Where the water comes from: ${rows
    .map(
      (row) => `${SOURCE_LABEL[row.key]} ${millilitres(Math.round(row.ml))}, ${percent(row.share)}`,
    )
    .join('; ')}.`;
}
