import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { AppHref } from '../../components/app-href';
import type { ShellyDevice } from '@smarteverything/shelly';
import { href as routes } from '../../app-shell/hrefs';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { StatusChip } from '../../components/status-chip';
import { Text } from '../../components/text';
import { useEntityStore } from '../../store/store-context';
import { LeaseCaption } from './lease-caption';
import { MapLegend, statusLine, useZoneColours } from './room-map-legend';
import { modelFor } from './room-geometry';
import { RoomMap } from './room-map';
import { TrackDetails } from './track-details';
import { useLivePresence } from './use-live-presence';
import { deviceLinksIn } from './zone-devices';

function useZoneSelection(sensor: ShellyDevice): {
  readonly selected: string | null;
  readonly choose: (key: string) => void;
} {
  const router = useRouter();
  const store = useEntityStore();
  const [selected, setSelected] = useState<string | null>(null);
  const choose = (key: string): void => {
    if (selected !== key) {
      setSelected(key);
      return;
    }
    const zone = sensor.zones.find((item) => item.key === key);
    const child = zone === undefined ? undefined : deviceLinksIn(store.get()).get(zone.externalId);
    setSelected(null);
    if (child !== undefined) router.push(routes.device(child));
  };
  return { selected, choose };
}

function StageHeader({
  sensor,
  tracking,
}: {
  readonly sensor: ShellyDevice;
  readonly tracking: boolean;
}): ReactNode {
  const occupied = statusLine(sensor).startsWith('Occupied');
  return (
    <View className="min-h-touch-min flex-row items-center justify-between gap-2">
      <Text variant="callout" tone={occupied ? 'primary' : 'variant'} numberOfLines={1}>
        {statusLine(sensor)}
      </Text>
      {tracking ? <StatusChip status="live" label="Live" /> : null}
    </View>
  );
}

function AddZone({ target }: { readonly target: AppHref }): ReactNode {
  return (
    <View className="absolute inset-0 items-center justify-center" pointerEvents="box-none">
      <Button label="Add a zone" icon="plus" variant="tonal" href={target} />
    </View>
  );
}

export function LiveRoomMap({
  sensor: base,
  addZone,
}: {
  readonly sensor: ShellyDevice;
  readonly addZone?: AppHref;
}): ReactNode {
  const { frame, onLayout, lease, sensor, trail } = useLivePresence(base);
  const { selected, choose } = useZoneSelection(sensor);
  const colours = useZoneColours(sensor);
  const model = modelFor(sensor, undefined, false);
  const empty = sensor.zones.every((zone) => zone.main);
  return (
    <View ref={frame} onLayout={onLayout} collapsable={false} className="gap-section-gap">
      <Card>
        <StageHeader sensor={sensor} tracking={lease.tracking} />
        <View className="relative">
          <RoomMap
            sensor={sensor}
            live={lease.tracking}
            trail={trail}
            selected={selected}
            onZone={choose}
          />
          {empty && addZone !== undefined ? <AddZone target={addZone} /> : null}
        </View>
        <LeaseCaption sensor={sensor} lease={lease} />
        <MapLegend
          sensor={sensor}
          colours={colours}
          blindSpots={model.blind.count}
          selected={selected}
          onSelect={choose}
          tracking={lease.tracking ? sensor.tracks.length : null}
        />
      </Card>
      {lease.tracking ? <TrackDetails sensor={sensor} /> : null}
    </View>
  );
}
