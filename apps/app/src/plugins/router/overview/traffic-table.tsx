import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import { rateParts } from './hero-model';
import type { TrafficTableRow } from './traffic-model';

function Cell({
  text,
  grow = false,
}: {
  readonly text: string;
  readonly grow?: boolean;
}): ReactNode {
  return (
    <Text variant="callout" className={grow ? 'tabular flex-1' : 'tabular w-24 text-right'}>
      {text}
    </Text>
  );
}

function rateText(megabits: number): string {
  const { value, unit } = rateParts(megabits);
  return `${value} ${unit}`;
}

export function TrafficTable({ rows }: { readonly rows: readonly TrafficTableRow[] }): ReactNode {
  return (
    <View accessibilityLabel="Traffic table" className="gap-1.5">
      <View className="flex-row gap-3">
        <Text variant="caption" tone="variant" className="flex-1">
          Time
        </Text>
        <Text variant="caption" tone="variant" className="w-24 text-right">
          Download
        </Text>
        <Text variant="caption" tone="variant" className="w-24 text-right">
          Upload
        </Text>
      </View>
      {rows.map((row) => (
        <View key={row.at} className="flex-row gap-3">
          <Cell text={clock(row.at)} grow />
          <Cell text={rateText(row.download)} />
          <Cell text={row.upload === null ? '—' : rateText(row.upload)} />
        </View>
      ))}
    </View>
  );
}
