import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gauge } from '../../../components/charts';
import { LiveFigure } from '../../../components/live-figure';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useLiveSelect } from '../data/treadmill-data';
import {
  movingZone,
  paceText,
  speedText,
  ZONE_DOT,
  ZONE_LABEL,
  zoneBands,
} from '../model/treadmill-model';

const MIN_GAUGE_PX = 96;

const DETAIL_FROM_PX = 160;

function Centre({
  speed,
  maxKmh,
  detailed,
}: {
  readonly speed: number;
  readonly maxKmh: number;
  readonly detailed: boolean;
}): ReactNode {
  const zone = movingZone(speed);
  return (
    <View className="items-center gap-1">
      <LiveFigure
        value={speedText(speed)}
        size={detailed ? 'xl' : 'l'}
        align="center"
        widest={speedText(maxKmh)}
        {...(detailed ? { unit: 'km/h' } : {})}
      />
      {detailed ? null : (
        <Text variant="caption" tone="variant">
          km/h
        </Text>
      )}
      {detailed ? (
        <View className="flex-row items-center gap-1.5">
          {zone === null ? null : <View className={cn('size-2 rounded-full', ZONE_DOT[zone])} />}
          <Text variant="caption" tone="variant">
            {zone === null ? 'Not moving' : `${ZONE_LABEL[zone]} · ${paceText(speed)}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function SpeedGauge({
  deviceId,
  view,
  size,
}: {
  readonly deviceId: string;
  readonly view: TreadmillStateView;
  readonly size: number;
}): ReactNode {
  const speed = useLiveSelect(deviceId, view.frame, (frame) => frame.belt.speedKmh);
  const { maxKmh, capKmh } = view.limits;
  const detailed = size >= DETAIL_FROM_PX;
  const zone = movingZone(speed);
  return (
    <View className="items-center gap-2">
      <Gauge
        value={speed}
        min={0}
        max={maxKmh}
        bands={zoneBands(maxKmh)}
        size={Math.max(size, MIN_GAUGE_PX)}
        ticks={{ step: 1, majorEvery: 3 }}
        {...(capKmh === null || capKmh >= maxKmh ? {} : { marker: capKmh })}
        label={
          zone === null
            ? 'Speed 0 kilometres per hour, the belt is not moving'
            : `Speed ${speedText(speed)} kilometres per hour, ${ZONE_LABEL[zone]} zone`
        }
      >
        <Centre speed={speed} maxKmh={maxKmh} detailed={detailed} />
      </Gauge>
      {capKmh === null || !detailed ? null : (
        <Text
          variant="caption"
          tone="variant"
          accessibilityLabel={`Maximum ${speedText(capKmh)} kilometres per hour`}
        >
          Max {speedText(capKmh)} km/h
        </Text>
      )}
    </View>
  );
}
