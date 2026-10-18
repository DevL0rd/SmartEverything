import type { SpeedTestResult } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { TimeSeriesChart } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { decimal, milliseconds } from '../../../format/number';
import { moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { rateParts } from './hero-model';
import { speedHistory } from './speed-model';

const CHART_HEIGHT = 160;
const LIST_PREVIEW = 4;

function rate(megabits: number): string {
  const { value, unit } = rateParts(megabits);
  return `${value} ${unit}`;
}

export function LastResult({ test }: { readonly test: SpeedTestResult }): ReactNode {
  const now = useMinute();
  return (
    <List title="Last result">
      <ValueRow title="Download" value={rate(test.downloadMbps)} />
      <ValueRow title="Upload" value={rate(test.uploadMbps)} />
      <ValueRow title="Latency" value={milliseconds(test.pingMs)} />
      <ValueRow title="Jitter" value={milliseconds(test.jitterMs)} />
      <ValueRow title="Packet loss" value={`${decimal(test.packetLossPercent, 1)} %`} />
      <ValueRow title="When" value={moment(test.at, now)} />
    </List>
  );
}

function Legend(): ReactNode {
  const items = [
    ['Download', 'bg-viz-1'],
    ['Upload', 'bg-viz-2'],
  ] as const;
  return (
    <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
      {items.map(([label, swatch]) => (
        <View key={label} className="flex-row items-center gap-1.5">
          <View aria-hidden className={cn('size-2.5 rounded-full', swatch)} />
          <Text variant="footnote">{label}</Text>
        </View>
      ))}
      <Text variant="footnote" tone="variant">
        Mb/s
      </Text>
    </View>
  );
}

function HistoryChart({ tests }: { readonly tests: readonly SpeedTestResult[] }): ReactNode {
  const { download, upload } = speedHistory(tests);
  return (
    <Card title="History · last 30 days">
      <Legend />
      <View aria-hidden>
        <TimeSeriesChart
          range="30d"
          unit="Mb/s"
          height={CHART_HEIGHT}
          formatValue={(value) => rateParts(value).value}
          series={[
            { label: 'Download', colour: 'viz-1', points: download },
            { label: 'Upload', colour: 'viz-2', points: upload },
          ]}
        />
      </View>
    </Card>
  );
}

function TestRows({ tests }: { readonly tests: readonly SpeedTestResult[] }): ReactNode {
  const now = useMinute();
  const [all, setAll] = useState(false);
  const shown = all ? tests : tests.slice(0, LIST_PREVIEW);
  return (
    <View className="gap-2">
      <List>
        {shown.map((test) => (
          <ListRow
            key={test.id}
            title={moment(test.at, now)}
            value={`${rateParts(test.downloadMbps).value} ↓  ${rateParts(test.uploadMbps).value} ↑  ${milliseconds(test.pingMs)}`}
          />
        ))}
      </List>
      {all || tests.length <= LIST_PREVIEW ? null : (
        <View className="items-start">
          <Button
            label={`Show all ${String(tests.length)}`}
            variant="text"
            onPress={() => {
              setAll(true);
            }}
          />
        </View>
      )}
    </View>
  );
}

export function SpeedHistory({ tests }: { readonly tests: readonly SpeedTestResult[] }): ReactNode {
  if (tests.length === 0) {
    return (
      <EmptyState
        compact
        icon="gauge"
        title="No speed tests yet"
        body="A test takes about 20 seconds."
      />
    );
  }
  return (
    <View className="gap-section-gap">
      <HistoryChart tests={tests} />
      <TestRows tests={tests} />
    </View>
  );
}
