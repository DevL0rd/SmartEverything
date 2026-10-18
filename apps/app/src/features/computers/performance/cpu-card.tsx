import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { CoreGrid } from '../../../components/charts';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { decimal } from '../../../format/number';
import { joinParts } from '../../../format/text';
import type { Device } from '../../../store/state';
import { DemandRegion } from '../../../store/demand-region';
import { LiveFact } from '../components/live-fact';
import { useComputerSelect } from '../data/computer-metrics';
import { factsOf } from '../data/computer-device';
import { PERCENT_DOMAIN, whole } from '../model/computer-charts';
import { WARM_CELSIUS } from '../model/computer-view';
import type { ViewRange } from '../model/performance';
import { RangeChart, type RangeLine } from './range-chart';

const TOPICS = ['cpu'] as const;
const TOTAL: RangeLine = {
  ids: ['cpu/load'],
  metric: 'cpu_load',
  label: 'Total',
  colour: 'viz-blue',
};
const SPLIT: readonly RangeLine[] = [
  TOTAL,
  { ids: ['cpu/performanceLoad'], metric: null, label: 'Performance cores', colour: 'viz-magenta' },
  { ids: ['cpu/efficiencyLoad'], metric: null, label: 'Efficiency cores', colour: 'viz-violet' },
];
const JUST_TOTAL: readonly RangeLine[] = [TOTAL];

function SpeedFact({
  deviceId,
  stale,
}: {
  readonly deviceId: string;
  readonly stale: boolean;
}): ReactNode {
  const maxGhz = useComputerSelect(deviceId, (parts) => parts.cpu?.maxFrequencyGhz ?? null);
  return (
    <LiveFact
      deviceId={deviceId}
      label="Speed"
      unit={maxGhz === null ? 'GHz' : `GHz of ${decimal(maxGhz, 1)}`}
      widest="8.8"
      digits={1}
      stale={stale}
      read={(parts) => parts.cpu?.frequencyGhz ?? null}
    />
  );
}

function PowerFact({
  deviceId,
  stale,
}: {
  readonly deviceId: string;
  readonly stale: boolean;
}): ReactNode {
  const limit = useComputerSelect(deviceId, (parts) => parts.cpu?.powerLimitWatts ?? null);
  return (
    <LiveFact
      deviceId={deviceId}
      label="Power"
      unit={limit === null ? 'W' : `W of ${decimal(limit)}`}
      widest="88"
      stale={stale}
      read={(parts) => parts.cpu?.powerWatts ?? null}
    />
  );
}

function LoadAverage({ deviceId }: { readonly deviceId: string }): ReactNode {
  const average = useComputerSelect(deviceId, (parts) =>
    parts.cpu === undefined
      ? null
      : parts.cpu.loadAverage.map((load) => decimal(load, 1)).join(' · '),
  );
  if (average === null) return null;
  return (
    <View>
      <Text variant="caption" tone="variant">
        Load average
      </Text>
      <Text variant="callout" className="tabular">
        {average}
      </Text>
    </View>
  );
}

function CpuFacts({
  deviceId,
  stale,
}: {
  readonly deviceId: string;
  readonly stale: boolean;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-end gap-x-6 gap-y-2">
      <LiveFact
        deviceId={deviceId}
        label="Usage"
        size="l"
        unit="%"
        widest="100"
        stale={stale}
        read={(parts) => parts.cpu?.load ?? null}
      />
      <SpeedFact deviceId={deviceId} stale={stale} />
      <LiveFact
        deviceId={deviceId}
        label="Temperature"
        unit="°C"
        widest="100"
        stale={stale}
        read={(parts) => parts.cpu?.temperature ?? null}
        toneOf={(value) => (value >= WARM_CELSIUS ? 'warning' : 'default')}
      />
      <PowerFact deviceId={deviceId} stale={stale} />
      <LoadAverage deviceId={deviceId} />
    </View>
  );
}

function Threads({ deviceId }: { readonly deviceId: string }): ReactNode {
  const cores = useComputerSelect(deviceId, (parts) => parts.cpu?.cores);
  if (cores === undefined) return null;
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant">
        Each thread
      </Text>
      <CoreGrid values={cores} />
    </View>
  );
}

function SplitSwitch({
  split,
  onChange,
}: {
  readonly split: boolean;
  readonly onChange: (next: boolean) => void;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <Switch value={split} label="Split by core type" onChange={onChange} />
      <Text variant="callout" tone="variant">
        Split by core type
      </Text>
    </View>
  );
}

export function CpuCard({
  device,
  range,
}: {
  readonly device: Device;
  readonly range: ViewRange;
}): ReactNode {
  const hybrid = useComputerSelect(
    device.id,
    (parts) => (parts.cpu?.performanceLoad ?? null) !== null,
  );
  const [split, setSplit] = useState(false);
  const facts = factsOf(device);
  const lines = useMemo(() => (split && hybrid ? SPLIT : JUST_TOTAL), [split, hybrid]);
  const subtitle = joinParts([
    facts.processor,
    facts.threads === null ? null : `${String(facts.threads)} threads`,
  ]);
  return (
    <Card title="CPU" className="flex-1">
      <DemandRegion deviceId={device.id} topics={TOPICS} history={device} className="gap-3">
        {subtitle === '' ? null : (
          <Text variant="footnote" tone="variant">
            {subtitle}
          </Text>
        )}
        <CpuFacts deviceId={device.id} stale={!device.online} />
        {range === 'live' && hybrid ? <SplitSwitch split={split} onChange={setSplit} /> : null}
        <RangeChart
          deviceId={device.id}
          range={range}
          lines={lines}
          yDomain={PERCENT_DOMAIN}
          label="CPU chart"
          unit="%"
          formatValue={whole}
          offline={!device.online}
        />
        <Threads deviceId={device.id} />
      </DemandRegion>
    </Card>
  );
}
