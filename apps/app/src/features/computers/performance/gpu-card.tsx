import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ComputerParts, GpuSnapshot } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { decimal } from '../../../format/number';
import { sameJson } from '../../../store/same-json';
import { DemandRegion } from '../../../store/demand-region';
import { LiveFact, type LiveFactProps } from '../components/live-fact';
import { useComputerSelect } from '../data/computer-metrics';
import { PERCENT_DOMAIN, whole } from '../model/computer-charts';
import { WARM_CELSIUS } from '../model/computer-view';
import type { ViewRange } from '../model/performance';
import { RangeChart, type RangeLine } from './range-chart';

const TOPICS = ['gpu'] as const;
const BYTES_PER_GB = 1_000_000_000;
const FULL = 100;

interface GpuFacts {
  readonly name: string;
  readonly vramGb: number;
  readonly vramTotal: number;
  readonly powerLimit: number | null;
}

function findGpu(parts: ComputerParts, gpuId: string): GpuSnapshot | undefined {
  return parts.gpu?.gpus.find((entry) => entry.id === gpuId);
}

function gpuOf(parts: ComputerParts, gpuId: string): GpuFacts | null {
  const gpu = findGpu(parts, gpuId);
  if (gpu === undefined) return null;
  return {
    name: gpu.name,
    vramGb: gpu.memoryTotalBytes / BYTES_PER_GB,
    vramTotal: gpu.memoryTotalBytes,
    powerLimit: gpu.powerLimitWatts,
  };
}

function Codecs({
  deviceId,
  gpuId,
}: {
  readonly deviceId: string;
  readonly gpuId: string;
}): ReactNode {
  const line = useComputerSelect(deviceId, (parts) => {
    const gpu = findGpu(parts, gpuId);
    if (gpu?.decoderLoad === null || gpu?.decoderLoad === undefined || gpu.encoderLoad === null) {
      return null;
    }
    return `Video encoder ${decimal(gpu.encoderLoad)} % · Video decoder ${decimal(gpu.decoderLoad)} %`;
  });
  return line === null ? null : (
    <Text variant="caption" tone="variant" className="tabular">
      {line}
    </Text>
  );
}

interface FactProps extends Omit<LiveFactProps, 'read' | 'deviceId'> {
  readonly deviceId: string;
  readonly gpuId: string;
  readonly of: (gpu: GpuSnapshot) => number | null;
}

function GpuFact({ gpuId, of, ...fact }: FactProps): ReactNode {
  return (
    <LiveFact
      {...fact}
      read={(parts) => {
        const gpu = findGpu(parts, gpuId);
        return gpu === undefined ? null : of(gpu);
      }}
    />
  );
}

function GpuFactsRow({
  deviceId,
  gpuId,
  facts,
  stale,
}: {
  readonly deviceId: string;
  readonly gpuId: string;
  readonly facts: GpuFacts;
  readonly stale: boolean;
}): ReactNode {
  const shared = { deviceId, gpuId, stale } as const;
  const limit = facts.powerLimit;
  return (
    <View className="flex-row flex-wrap items-end gap-x-6 gap-y-2">
      <GpuFact {...shared} label="Graphics" size="l" unit="%" widest="100" of={(gpu) => gpu.load} />
      <GpuFact
        {...shared}
        label="Video memory"
        unit={`of ${decimal(facts.vramGb)} GB`}
        widest="88.8"
        digits={1}
        of={(gpu) => gpu.memoryUsedBytes / BYTES_PER_GB}
      />
      <GpuFact
        {...shared}
        label="Temperature"
        unit="°C"
        widest="100"
        of={(gpu) => gpu.temperature}
        toneOf={(value) => (value >= WARM_CELSIUS ? 'warning' : 'default')}
      />
      <GpuFact
        {...shared}
        label="Power"
        unit={limit === null ? 'W' : `W of ${decimal(limit)}`}
        widest="888"
        of={(gpu) => gpu.powerWatts}
      />
      <GpuFact {...shared} label="Fan" unit="%" widest="100" of={(gpu) => gpu.fanPercent} />
    </View>
  );
}

function useGpuLines(gpuId: string, total: number): readonly RangeLine[] {
  return useMemo(
    () => [
      { ids: [`gpu/${gpuId}.load`], metric: 'gpu_load', label: 'Load', colour: 'viz-blue' },
      {
        ids: [`gpu/${gpuId}.memoryUsedBytes`],
        factor: total === 0 ? 0 : FULL / total,
        metric: 'gpu_memory_used',
        label: 'Video memory',
        colour: 'viz-magenta',
      },
    ],
    [gpuId, total],
  );
}

export function GpuCard({
  deviceId,
  online,
  gpuId,
  range,
}: {
  readonly deviceId: string;
  readonly online: boolean;
  readonly gpuId: string;
  readonly range: ViewRange;
}): ReactNode {
  const facts = useComputerSelect(deviceId, (parts) => gpuOf(parts, gpuId), sameJson);
  const lines = useGpuLines(gpuId, facts?.vramTotal ?? 0);
  if (facts === null) return null;
  return (
    <Card title="GPU" className="flex-1">
      <DemandRegion deviceId={deviceId} topics={TOPICS} className="gap-3">
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {facts.name}
        </Text>
        <GpuFactsRow deviceId={deviceId} gpuId={gpuId} facts={facts} stale={!online} />
        <RangeChart
          deviceId={deviceId}
          range={range}
          lines={lines}
          yDomain={PERCENT_DOMAIN}
          label="GPU chart"
          unit="%"
          formatValue={whole}
          offline={!online}
        />
        <Codecs deviceId={deviceId} gpuId={gpuId} />
      </DemandRegion>
    </Card>
  );
}
