import type { ReactNode } from 'react';
import type { ShellyDevice, ShellyTrack } from '@smarteverything/shelly';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { cellsAt, modelFor, trackToView } from './room-geometry';
import { zoneName } from './room-map-legend';

function reading(label: string, value: number | undefined): string | null {
  return value === undefined ? null : `${label} ${value.toFixed(1)}`;
}

export function trackFields(track: ShellyTrack): string {
  return [
    reading('x', track.x),
    reading('y', track.y),
    reading('z', track.z),
    reading('minz', track.minz),
    reading('maxz', track.maxz),
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

function placeOf(sensor: ShellyDevice, track: ShellyTrack): string {
  const model = modelFor(sensor, undefined, false);
  const view = trackToView(track, model.origin);
  const zone = sensor.zones.find((item) => {
    const shape = model.shapes.get(item.key);
    return !item.main && shape !== undefined && cellsAt(shape.cells, view);
  });
  return zone === undefined ? 'in room' : `in ${zoneName(zone)}`;
}

export function TrackDetails({ sensor }: { readonly sensor: ShellyDevice }): ReactNode {
  if (sensor.tracks.length === 0)
    return (
      <Text variant="footnote" tone="variant">
        Nothing detected yet. The sensor only sends data while someone is in its view.
      </Text>
    );
  return (
    <List
      inset
      title="Live objects"
      footer="Vendor fields are shown without units until their meaning is confirmed."
    >
      {sensor.tracks.map((track) => (
        <ListRow
          key={track.id}
          title={`Object ${String(track.id)} · ${placeOf(sensor, track)}`}
          subtitle={trackFields(track)}
          wrapSubtitle
        />
      ))}
    </List>
  );
}
