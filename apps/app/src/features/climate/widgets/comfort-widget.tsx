import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Figure } from '../../../components/figure';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { WidgetFrame } from '../../../components/widget-board';
import { useRooms } from '../../../store/selectors';
import { MetricDial } from '../components/metric-dial';
import { useClimateSources } from '../model/climate-devices';
import { comfortOf, INDOOR_METRICS, type MetricReading, type RoomComfort } from '../model/comfort';
import { metricColour, metricIcon, metricShort } from '../model/metric-look';
import { comfortDialFit, roomGridFit, rowsOf, type ComfortDialFit } from './climate-fit';
import { useClimateBody } from './use-body-box';

function Line({
  reading,
  well,
}: {
  readonly reading: MetricReading;
  readonly well: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2">
      {well ? (
        <IconWell icon={metricIcon(reading.metric)} colour={metricColour(reading)} size="s" />
      ) : null}
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
  fit,
}: {
  readonly reading: MetricReading;
  readonly fit: ComfortDialFit;
}): ReactNode {
  return (
    <View
      className={
        fit.stacked
          ? 'min-w-0 flex-1 items-center gap-1'
          : 'min-w-0 flex-1 flex-row items-center gap-3'
      }
    >
      <MetricDial reading={reading} size={fit.dial} />
      <View className={fit.stacked ? 'min-w-0 items-center' : 'min-w-0 flex-1'}>
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

function Single({ readings }: { readonly readings: readonly MetricReading[] }): ReactNode {
  const fit = comfortDialFit(useClimateBody().box, readings.length);
  return (
    <View className="flex-1 flex-row items-center justify-around gap-3">
      {readings.map((reading) => (
        <DialCell key={reading.metric} reading={reading} fit={fit} />
      ))}
    </View>
  );
}

function RoomRow({
  room,
  wells,
}: {
  readonly room: RoomComfort;
  readonly wells: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-1 rounded-md bg-surface-2 px-3 py-2">
      <Text variant="body-strong" numberOfLines={1}>
        {room.room ?? 'Your home'}
      </Text>
      <View className="flex-row gap-3">
        {room.readings.map((reading) => (
          <Line key={reading.metric} reading={reading} well={wells} />
        ))}
      </View>
    </View>
  );
}

function roomKey(room: RoomComfort): string {
  return room.roomId ?? 'home';
}

function Rooms({ rooms }: { readonly rooms: readonly RoomComfort[] }): ReactNode {
  const readings = Math.max(0, ...rooms.map((entry) => entry.readings.length));
  const fit = roomGridFit(useClimateBody().box, rooms.length, readings);
  return (
    <View className="flex-1 gap-2">
      {rowsOf(rooms.slice(0, fit.shown), fit.columns).map((row) => (
        <View key={row.map(roomKey).join()} className="flex-row gap-3">
          {row.map((entry) => (
            <RoomRow key={roomKey(entry)} room={entry} wells={fit.wells} />
          ))}
          {Array.from({ length: fit.columns - row.length }, (_, index) => (
            <View key={`gap-${String(index)}`} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}

function useIndoorComfort(room: string | null): readonly RoomComfort[] {
  return comfortOf(useClimateSources(room), useRooms(), INDOOR_METRICS);
}

export function ComfortWidget({ room }: { readonly room: string | null }): ReactNode {
  const comfort = useIndoorComfort(room);
  const single = comfort.length === 1 ? comfort[0] : undefined;
  return (
    <WidgetFrame title="Indoors" icon="thermometer" accent="temp-warm">
      {single === undefined ? <Rooms rooms={comfort} /> : <Single readings={single.readings} />}
    </WidgetFrame>
  );
}
