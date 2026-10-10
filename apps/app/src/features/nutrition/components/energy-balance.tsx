import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { amountText } from '../model/macros';

function Column({
  label,
  value,
  stacked,
}: {
  readonly label: string;
  readonly value: string;
  readonly stacked: boolean;
}): ReactNode {
  if (stacked) {
    return (
      <View className="flex-row items-baseline justify-between gap-2">
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="callout" className="tabular" numberOfLines={1}>
          {`${value} kcal`}
        </Text>
      </View>
    );
  }
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {label}
      </Text>
      <Figure value={value} unit="kcal" size="s" />
    </View>
  );
}

export function EnergyBalance({
  eaten,
  burned,
  stacked = false,
}: {
  readonly eaten: number;
  readonly burned: number;
  readonly stacked?: boolean;
}): ReactNode {
  const net = eaten - burned;
  const sign = net > 0 ? '+' : net < 0 ? '−' : '';
  return (
    <View className={stacked ? 'gap-1' : 'flex-row gap-3'}>
      <Column label="Eaten" value={amountText(eaten, 'kcal')} stacked={stacked} />
      <Column label="Burned" value={amountText(burned, 'kcal')} stacked={stacked} />
      <Column label="Net" value={`${sign}${amountText(Math.abs(net), 'kcal')}`} stacked={stacked} />
    </View>
  );
}
