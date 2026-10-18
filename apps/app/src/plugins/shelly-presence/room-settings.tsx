import { usePresenceSelection } from './use-presence-selection';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { ShellyDevice } from '@smarteverything/shelly';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { RoomMap } from './room-map';
import { ZoneEditor } from './zone-editor';
import { AreaEditor } from './area-editor';
import { usePresenceOperation } from './use-presence-operation';
import { OperationFeedback } from './operation-feedback';
import { actionAvailable } from './presence-operation';
import { LiveRoomMap } from './live-room-map';
import { background } from '@smarteverything/logging';

function BlindSpots({ sensor }: { readonly sensor: ShellyDevice }): ReactNode {
  const [area, setArea] = useState(sensor.config?.blind ?? []);
  const [valid, setValid] = useState(true);
  const operation = usePresenceOperation(sensor);
  return (
    <View className="gap-3">
      <RoomMap sensor={sensor} area={area} />
      <AreaEditor
        value={area}
        change={setArea}
        validity={setValid}
        context={sensor.zones.flatMap((zone) => zone.config.area ?? [])}
      />
      <OperationFeedback operation={operation} />
      <Button
        label="Save blind spots"
        loading={operation.busy}
        disabled={!valid || sensor.connection.state !== 'online'}
        onPress={() => {
          background(
            operation.run({ action: 'set_presence', params: { config: { blind: area } } }),
            'operation.run_failed',
          );
        }}
      />
    </View>
  );
}

function SelectedArea({
  sensor,
  selected,
  close,
}: {
  readonly sensor: ShellyDevice;
  readonly selected: string;
  readonly close: () => void;
}): ReactNode {
  if (selected === 'blind')
    return (
      <View className="gap-3">
        <BlindSpots sensor={sensor} />
        <Button label="Back to zones" variant="text" onPress={close} />
      </View>
    );
  const zone = selected === 'new' ? null : sensor.zones.find((item) => item.key === selected);
  if (zone === undefined)
    return (
      <View className="gap-3">
        <Text>This zone was deleted.</Text>
        <Button label="Back to zones" onPress={close} />
      </View>
    );
  return <ZoneEditor key={selected} sensor={sensor} zone={zone} close={close} />;
}

function RoomZoneList({
  sensor,
  select,
}: {
  readonly sensor: ShellyDevice;
  readonly select: (value: string) => void;
}): ReactNode {
  return (
    <List title="Zones">
      {sensor.zones.map((zone) => (
        <NavRow
          key={zone.key}
          title={zone.config.name ?? (zone.main ? 'Main zone' : zone.key)}
          subtitle={
            zone.main
              ? 'Room boundary · main zone'
              : `${String((zone.config.area ?? []).length)} segments`
          }
          onPress={() => {
            select(zone.key);
          }}
        />
      ))}
    </List>
  );
}

export function RoomSettings({ sensor }: { readonly sensor: ShellyDevice }): ReactNode {
  const params = useLocalSearchParams<{ readonly focus?: string; readonly zone?: string }>();
  const zoneKey = sensor.zones.find(
    (zone) => String(zone.config.id) === params.zone || zone.key === params.zone,
  )?.key;
  const initial =
    zoneKey ??
    (params.focus === 'add-zone' ? 'new' : params.focus === 'blind-spots' ? 'blind' : null);
  const [written, setSelected] = usePresenceSelection('zone', initial);
  const selected =
    sensor.zones.find((zone) => String(zone.config.id) === written || zone.key === written)?.key ??
    written;
  if (selected !== null)
    return (
      <SelectedArea
        sensor={sensor}
        selected={selected}
        close={() => {
          setSelected(null);
        }}
      />
    );
  return (
    <View className="gap-section-gap">
      <LiveRoomMap sensor={sensor} />
      <RoomZoneList sensor={sensor} select={setSelected} />
      <Button
        label="Add zone"
        icon="plus"
        variant="tonal"
        disabled={!actionAvailable(sensor, 'add_zone')}
        onPress={() => {
          setSelected('new');
        }}
      />
      <List title="Excluded areas">
        <NavRow
          title="Blind spots"
          subtitle="Exact segments ignored by the sensor"
          onPress={() => {
            setSelected('blind');
          }}
        />
      </List>
    </View>
  );
}
