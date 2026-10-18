import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { gridColumnsOf } from '../../../components/frame-layout';
import { Segmented } from '../../../components/segmented';
import { useAreaWidth } from '../../../design/size-class';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { ComputerFrame } from '../components/computer-frame';
import { useComputerDetail, useComputerSelect } from '../data/computer-metrics';
import {
  packRows,
  performanceCards,
  spareColumns,
  type PerformanceCard,
} from '../model/performance-layout';
import { bodyWidthOf } from '../model/sections';
import { RANGE_OPTIONS, type ViewRange } from '../model/performance';
import { CpuCard } from './cpu-card';
import { GpuCard } from './gpu-card';
import { PerformanceMemoryCard } from './memory-card';
import { PowerCard } from './power-card';
import { Spare } from './spare';
import { SensorsList } from './sensors-list';
import { TempsCard } from './temps-card';

const SPAN_CLASS = { 1: 'min-w-0 flex-1', 2: 'min-w-0 flex-2' } as const;

function CardOf({
  card,
  device,
  range,
  gpuId,
  permitted,
}: {
  readonly card: PerformanceCard;
  readonly device: Device;
  readonly range: ViewRange;
  readonly gpuId: string | null;
  readonly permitted: boolean;
}): ReactNode {
  const { id, label, online } = { id: device.id, label: device.label, online: device.online };
  switch (card.kind) {
    case 'cpu':
      return <CpuCard device={device} range={range} />;
    case 'gpu':
      return <GpuCard deviceId={id} online={online} gpuId={card.gpuId} range={range} />;
    case 'memory':
      return <PerformanceMemoryCard deviceId={id} online={online} range={range} />;
    case 'temps':
      return <TempsCard deviceId={id} online={online} range={range} gpuId={gpuId} />;
    case 'power':
      return (
        <PowerCard
          deviceId={id}
          online={online}
          name={label}
          range={range}
          gpuId={gpuId}
          permitted={permitted}
        />
      );
  }
}

function Grid({
  device,
  range,
}: {
  readonly device: Device;
  readonly range: ViewRange;
}): ReactNode {
  const area = useAreaWidth();
  const gpuIds = useComputerSelect(device.id, (parts) =>
    (parts.gpu?.gpus ?? []).map((gpu) => gpu.id).join('\n'),
  );
  const features = useComputerDetail(device.id, device.online).data?.features;
  const ids = gpuIds === '' ? [] : gpuIds.split('\n');
  const cols = gridColumnsOf(bodyWidthOf(area));
  const rows = packRows(performanceCards(ids, cols), cols);
  const permitted = features === undefined || features.includes('cpu_power');
  return (
    <View className="gap-4">
      {rows.map((row) => (
        <View key={row.map((card) => card.key).join()} className="flex-row gap-4">
          {row.map((card) => (
            <View key={card.key} className={SPAN_CLASS[Math.min(card.span, cols) === 2 ? 2 : 1]}>
              <CardOf
                card={card}
                device={device}
                range={range}
                gpuId={ids[0] ?? null}
                permitted={permitted}
              />
            </View>
          ))}
          <Spare spare={spareColumns(row, cols)} />
        </View>
      ))}
    </View>
  );
}

function Performance({ device }: { readonly device: Device }): ReactNode {
  const [range, setRange] = useState<ViewRange>('live');
  return (
    <ComputerFrame
      deviceId={device.id}
      title="Performance"
      subtitle={device.label}
      width="dashboard"
    >
      <Segmented label="Range" value={range} onChange={setRange} options={RANGE_OPTIONS} />
      <Grid device={device} range={range} />
      <SensorsList deviceId={device.id} offline={!device.online} />
    </ComputerFrame>
  );
}

export function ComputerPerformanceScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  if (device?.kind !== 'computer') {
    return (
      <ComputerFrame deviceId={deviceId} title="Performance">
        {null}
      </ComputerFrame>
    );
  }
  return <Performance device={device} />;
}
