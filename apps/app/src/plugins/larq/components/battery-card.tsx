import type { BottleCareView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Sparkline } from '../../../components/charts';
import { Text } from '../../../components/text';
import { BatteryScaleBar } from '../charts/battery-scale';
import { BATTERY_COLOUR } from '../model/bottle-colours';
import { batteryScaleOf, chargeLine, dischargeSeries } from '../model/care-model';

export function BatteryCard({
  battery,
}: {
  readonly battery: BottleCareView['battery'];
}): ReactNode {
  const series = dischargeSeries(battery.points);
  return (
    <Card title="Battery" icon="battery">
      <Text variant="body-strong">{batteryScaleOf(battery).line}</Text>
      <BatteryScaleBar scale={batteryScaleOf(battery)} />
      {series.length >= 2 ? (
        <View className="gap-1">
          <Text variant="label">Last weeks</Text>
          <Sparkline points={series} colour={BATTERY_COLOUR} height={48} area domain={[0, 100]} />
        </View>
      ) : null}
      {battery.charges.length === 0 ? (
        <Text variant="footnote" tone="variant">
          No charges seen yet.
        </Text>
      ) : (
        <View className="gap-1">
          <Text variant="label">{`Charges (${String(battery.chargeCycles)} in all)`}</Text>
          {battery.charges.map((charge) => (
            <Text key={charge.startAt} variant="callout" tone="variant">
              {chargeLine(charge)}
            </Text>
          ))}
        </View>
      )}
    </Card>
  );
}
