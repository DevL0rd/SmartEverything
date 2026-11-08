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
import { RING_MIN_PX, RING_PX, SPARK_MIN_PX, SPARK_PX, shownPx, useGraphRoom } from './layout';

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
  cls,
  live,
}: {
  readonly device: Device;
  readonly pm: PresentedCapability;
  readonly pm25: number | null;
  readonly cls: WideClass;
  readonly live: boolean;
}): ReactNode {
  const { room, onLayout } = useGraphRoom(RING_PX[cls]);
  const gauge = shownPx(RING_PX[cls], room, RING_MIN_PX);
  const spark = shownPx(SPARK_PX[cls], room, SPARK_MIN_PX);
  return (
    <View
      onLayout={onLayout}
      className={cn('min-h-0 flex-1 justify-end', !device.online && 'opacity-60')}
    >
      <View className="flex-row items-center gap-3">
        {gauge === null ? null : <PmGauge pm25={pm25} size={gauge} />}
        {spark === null ? null : (
          <View className="min-w-0 flex-1">
            <LiveSpark
              device={device}
              capability={pm.key}
              live={live}
              colour={airBandColour(pm25)}
              height={spark}
            />
          </View>
        )}
      </View>
    </View>
  );
}
