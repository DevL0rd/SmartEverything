import type { PrinterSupplyView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { TimeSeriesChart } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { LoadedQuery } from '../../../components/loaded-query';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { usePrinterLive, type SupplyLive } from '../../../features/device-visuals';
import type { Device } from '../../../store/state';
import { SupplyTank } from '../components/supply-tank';
import { usePrinterView } from '../data/use-printer-view';
import type { ViewOf } from '../data/printer-api';
import { burnLine, forecastLine, lineRole, marksOf, seriesOf } from '../model/supplies-view';
import { PERIOD_OPTIONS, type StatsPeriod } from '../model/stats-view';

function LevelChart({
  series,
  period,
  name,
}: {
  readonly series: ReturnType<typeof seriesOf>;
  readonly period: StatsPeriod;
  readonly name: string;
}): ReactNode {
  return series.length === 0 ? (
    <Text variant="callout" tone="variant">
      No level history in this range yet.
    </Text>
  ) : (
    <TimeSeriesChart
      series={series}
      range={period}
      unit="%"
      height={140}
      yDomain={[0, 100]}
      label={`${name} level over time with the forecast`}
    />
  );
}

function SupplyCard({
  view,
  supply,
  period,
  tank,
}: {
  readonly view: ViewOf<'supplies'>;
  readonly supply: PrinterSupplyView;
  readonly period: StatsPeriod;
  readonly tank: SupplyLive | undefined;
}): ReactNode {
  const series = seriesOf(view, supply, lineRole(supply, view.supplies.indexOf(supply)));
  const burn = burnLine(supply);
  const forecast = forecastLine(supply);
  const marks = marksOf(view, supply);
  return (
    <Card title={supply.name === '' ? 'Supply' : supply.name} icon="droplet">
      <View className="gap-2">
        <View className="flex-row items-start gap-3">
          {tank === undefined ? null : <SupplyTank supply={tank} height={110} compact />}
          <View className="min-w-0 flex-1">
            <LevelChart series={series} period={period} name={supply.name} />
          </View>
        </View>
        {forecast === null ? null : <Text variant="callout">{forecast}</Text>}
        {burn === null ? null : (
          <Text variant="caption" tone="variant">
            {burn}
          </Text>
        )}
        {marks.map((mark) => (
          <Text key={mark} variant="caption" tone="faint">
            {mark}
          </Text>
        ))}
      </View>
    </Card>
  );
}

export function SuppliesSection({ device }: { readonly device: Device }): ReactNode {
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const live = usePrinterLive(device);
  const query = usePrinterView(device, 'supplies', { period });
  return (
    <View className="gap-section-gap">
      <Segmented label="Range" options={PERIOD_OPTIONS} value={period} fill onChange={setPeriod} />
      <LoadedQuery query={query}>
        {(view) =>
          view.supplies.length === 0 ? (
            <EmptyState
              icon="droplet"
              title="No supplies reported"
              body="This printer does not report ink or toner levels."
            />
          ) : (
            <View className="gap-section-gap">
              {view.supplies.map((supply) => (
                <SupplyCard
                  key={supply.key}
                  view={view}
                  supply={supply}
                  period={period}
                  tank={live?.supplies.find((entry) => entry.detail.key === supply.key)}
                />
              ))}
            </View>
          )
        }
      </LoadedQuery>
    </View>
  );
}
