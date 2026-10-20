import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PresentedCapability } from '@smarteverything/domain';
import { Gauge } from '../../../components/charts';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import type { Device } from '../../../store/state';
import { LiveSpark } from '../card/live-spark';
import type { WideClass } from '../card/wide-card';
import { airBandColour, PM25_BANDS, PM25_GAUGE_MAX } from './air-model';
import { RING_PX, SPARK_PX } from './layout';
import { levelPill } from './state-line';

function PmGauge({
  pm25,
  size,
}: {
  readonly pm25: number | null;
  readonly size: number;
}): ReactNode {
  return (
    <Gauge
      value={pm25 ?? 0}
      min={0}
      max={PM25_GAUGE_MAX}
      bands={PM25_BANDS}
      size={size}
      label={pm25 === null ? 'No PM2.5 reading' : `PM2.5 ${String(Math.round(pm25))}`}
    >
      <Text variant="body-strong">{pm25 === null ? '–' : String(Math.round(pm25))}</Text>
    </Gauge>
  );
}

export function PurifierGraph({
  device,
  pm,
  pm25,
  filter,
  cls,
  live,
}: {
  readonly device: Device;
  readonly pm: PresentedCapability;
  readonly pm25: number | null;
  readonly filter: number | null;
  readonly cls: WideClass;
  readonly live: boolean;
}): ReactNode {
  return (
    <View className={cn('flex-row items-center gap-3', !device.online && 'opacity-60')}>
      <PmGauge pm25={pm25} size={RING_PX[cls]} />
      <View className="min-w-0 flex-1 gap-1">
        <LiveSpark
          device={device}
          capability={pm.key}
          live={live}
          colour={airBandColour(pm25)}
          height={SPARK_PX[cls]}
        />
        {cls === 'm' ? levelPill('Filter', filter) : null}
      </View>
    </View>
  );
}
