import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Figure } from '../../../components/figure';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { WidgetFrame, isTall, type WidgetSize } from '../../../components/widget-board';
import { useRooms } from '../../../store/selectors';
import { MetricDial } from '../components/metric-dial';
import { useClimateSources } from '../model/climate-devices';
import { comfortOf, INDOOR_METRICS, type MetricReading, type RoomComfort } from '../model/comfort';
import { metricColour, metricIcon, metricShort } from '../model/metric-look';

function Line({ reading }: { readonly reading: MetricReading }): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2">
      <IconWell icon={metricIcon(reading.metric)} colour={metricColour(reading)} size="s" />
      <Figure
        value={reading.value}
        size="s"
        stale={reading.stale}
        {...(reading.unit === null ? {} : { unit: reading.unit })}
      />
    </View>
  );
}

function DialCell({
  reading,
  tall,
}: {
  readonly reading: MetricReading;
  readonly tall: boolean;
}): ReactNode {
  return (
    <View
      className={
        tall ? 'min-w-0 flex-1 items-center gap-1' : 'min-w-0 flex-1 flex-row items-center gap-3'
      }
    >
      <MetricDial reading={reading} size={tall ? 132 : 72} />
      <View className={tall ? 'items-center' : 'min-w-0 flex-1'}>
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {metricShort(reading.metric)}
        </Text>
        <Text variant="caption" tone={reading.stale ? 'faint' : reading.tone} numberOfLines={1}>
          {reading.stale ? 'Not current' : reading.verdict}
        </Text>
      </View>
    </View>
  );
}

function Single({
  readings,
  size,
}: {
  readonly readings: readonly MetricReading[];
  readonly size: WidgetSize;
}): ReactNode {
  if (size === 'S') {
    return (
      <View className="flex-1 justify-end gap-2">
        {readings.map((reading) => (
          <Line key={reading.metric} reading={reading} />
        ))}
      </View>
    );
  }
  return (
    <View className="flex-1 flex-row items-center justify-around gap-3">
      {readings.map((reading) => (
        <DialCell key={reading.metric} reading={reading} tall={isTall(size)} />
      ))}
    </View>
  );
}

function RoomRow({ room }: { readonly room: RoomComfort }): ReactNode {
  return (
    <View className="gap-2 rounded-md bg-surface-2 p-3">
      <Text variant="body-strong" numberOfLines={1}>
        {room.room ?? 'Your home'}
      </Text>
      <View className="flex-row gap-3">
        {room.readings.map((reading) => (
          <Line key={reading.metric} reading={reading} />
        ))}
      </View>
    </View>
  );
}

function useIndoorComfort(room: string | null): readonly RoomComfort[] {
  return comfortOf(useClimateSources(room), useRooms(), INDOOR_METRICS);
}

export function ComfortWidget({
  size,
  room,
}: {
  readonly size: WidgetSize;
  readonly room: string | null;
}): ReactNode {
  const comfort = useIndoorComfort(room);
  const single = comfort.length === 1 ? comfort[0] : undefined;
  return (
    <WidgetFrame title="Indoors" icon="thermometer" accent="temp-warm" size={size}>
      {single === undefined ? (
        <View className="flex-1 gap-2 overflow-hidden">
          {comfort.map((entry) => (
            <RoomRow key={entry.roomId ?? 'home'} room={entry} />
          ))}
        </View>
      ) : (
        <Single readings={single.readings} size={size} />
      )}
    </WidgetFrame>
  );
}
