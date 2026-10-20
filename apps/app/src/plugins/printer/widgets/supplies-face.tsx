import type { ReactNode } from 'react';
import { View } from 'react-native';
import { TimeSeriesChart } from '../../../components/charts';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { usePrinterLive } from '../../../features/device-visuals';
import type { Device } from '../../../store/state';
import { SupplyBars, SupplyTanks } from '../components/supply-band';
import { usePrinterView } from '../data/use-printer-view';
import { forecastLine, lineRole, seriesOf } from '../model/supplies-view';

function Burn({ device }: { readonly device: Device }): ReactNode {
  const supplies = usePrinterView(device, 'supplies', { period: 'month' });
  return (
    <LoadedQuery query={supplies}>
      {(view) => {
        const next = view.supplies
          .filter((supply) => supply.consumed && supply.daysLeft !== null)
          .sort((left, right) => (left.daysLeft ?? 0) - (right.daysLeft ?? 0))[0];
        const lines = view.supplies
          .filter((supply) => supply.consumed)
          .flatMap((supply, index) => seriesOf(view, supply, lineRole(supply, index)).slice(0, 1));
        return (
          <View className="min-w-0 flex-1 gap-2">
            {lines.length === 0 ? null : (
              <TimeSeriesChart
                series={lines}
                range="month"
                unit="%"
                height={90}
                yDomain={[0, 100]}
                label="Ink level over the last month"
              />
            )}
            {next === undefined ? null : (
              <Text variant="callout" numberOfLines={2}>
                Buy next: {next.name === '' ? 'cartridge' : next.name}. {forecastLine(next) ?? ''}
              </Text>
            )}
          </View>
        );
      }}
    </LoadedQuery>
  );
}

export function SuppliesFace({ device }: { readonly device: Device }): ReactNode {
  const { cls } = useWidgetFace();
  const live = usePrinterLive(device);
  if (live === null) return null;
  if (cls === 'l') {
    return (
      <View className="flex-1 gap-4">
        <SupplyBars live={live} />
        <Burn device={device} />
      </View>
    );
  }
  if (cls !== 'xl') return <SupplyBars live={live} />;
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <SupplyTanks live={live} compact />
      <Burn device={device} />
    </View>
  );
}
