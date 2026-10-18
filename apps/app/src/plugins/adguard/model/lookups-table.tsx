import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import type { HourBar } from './chart-model';

function Row({
  cells,
  header,
}: {
  readonly cells: readonly string[];
  readonly header: boolean;
}): ReactNode {
  const [time = '', allowed = '', blocked = ''] = cells;
  const variant = header ? 'caption' : 'callout';
  const tone = header ? 'variant' : 'default';
  return (
    <View className="flex-row gap-3" accessibilityRole={header ? 'header' : undefined}>
      <Text variant={variant} tone={tone} className="tabular flex-1">
        {time}
      </Text>
      <Text variant={variant} tone={tone} className="tabular w-20 text-right">
        {allowed}
      </Text>
      <Text variant={variant} tone={tone} className="tabular w-20 text-right">
        {blocked}
      </Text>
    </View>
  );
}

export function LookupsTable({
  bars,
  unit,
}: {
  readonly bars: readonly HourBar[];
  readonly unit: string;
}): ReactNode {
  return (
    <View className="gap-1.5">
      <Row header cells={[unit === 'hour' ? 'Hour' : 'Day', 'Allowed', 'Blocked']} />
      {bars.map((bar) => (
        <Row
          key={bar.key}
          header={false}
          cells={[bar.label, count(bar.allowed), count(bar.blocked)]}
        />
      ))}
    </View>
  );
}
