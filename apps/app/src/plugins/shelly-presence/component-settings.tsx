import { BthomeDiscovery } from './bthome-discovery';
import { usePresenceSelection } from './use-presence-selection';
import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import {
  SHELLY_BTHOME_COMPONENT,
  SHELLY_VIRTUAL_COMPONENT,
  type ShellyPresenceDevice,
} from '@smarteverything/domain';
import { Button } from '../../components/button';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { VirtualEditor } from './virtual-editor';
import { BthomeEditor } from './bthome-editor';
import { ManagementActions } from './management-actions';
import { atPath } from './form-model';
import { presenceActionAvailable } from './availability';

function ComponentEditor({
  sensor,
  selected,
  close,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly selected: string;
  readonly close: () => void;
}): ReactNode {
  if (selected.startsWith('device-new:'))
    return (
      <BthomeEditor
        sensor={sensor}
        component={null}
        sensorType={false}
        address={selected.slice(11)}
        close={close}
      />
    );
  if (selected === 'virtual-new')
    return <VirtualEditor sensor={sensor} component={null} close={close} />;
  if (selected.endsWith('-new'))
    return (
      <BthomeEditor
        sensor={sensor}
        component={null}
        sensorType={selected === 'sensor-new'}
        close={close}
      />
    );
  const component = sensor.components.find((entry) => entry.key === selected);
  const virtual = SHELLY_VIRTUAL_COMPONENT.safeParse(component);
  if (virtual.success)
    return <VirtualEditor sensor={sensor} component={virtual.data} close={close} />;
  const bthome = SHELLY_BTHOME_COMPONENT.safeParse(component);
  if (bthome.success && bthome.data.component !== 'bthome')
    return (
      <BthomeEditor
        sensor={sensor}
        component={bthome.data}
        sensorType={bthome.data.component === 'bthomesensor'}
        close={close}
      />
    );
  return <UnavailableComponent close={close} />;
}
function ComponentList({
  sensor,
  select,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly select: (key: string) => void;
}): ReactNode {
  const components = sensor.components.filter(
    (entry) =>
      SHELLY_VIRTUAL_COMPONENT.safeParse(entry).success ||
      (SHELLY_BTHOME_COMPONENT.safeParse(entry).success && entry.component !== 'bthome'),
  );
  return (
    <List title="Components">
      {components.map((component) => {
        const name = atPath(component.config, 'name');
        return (
          <NavRow
            key={component.key}
            title={typeof name === 'string' ? name : component.key}
            subtitle={component.component}
            onPress={() => {
              select(component.key);
            }}
          />
        );
      })}
    </List>
  );
}
function AddComponents({
  sensor,
  select,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly select: (key: string) => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Add virtual component"
        variant="tonal"
        icon="plus"
        disabled={!presenceActionAvailable(sensor, 'virtual_add')}
        onPress={() => {
          select('virtual-new');
        }}
      />
      <Button
        label="Add Bluetooth device"
        variant="tonal"
        disabled={!presenceActionAvailable(sensor, 'bthome_add_device')}
        onPress={() => {
          select('device-new');
        }}
      />
      <Button
        label="Add Bluetooth sensor"
        variant="tonal"
        disabled={!presenceActionAvailable(sensor, 'bthome_add_sensor')}
        onPress={() => {
          select('sensor-new');
        }}
      />
    </View>
  );
}

export function ComponentSettings({
  sensor,
}: {
  readonly sensor: ShellyPresenceDevice;
}): ReactNode {
  const params = useLocalSearchParams<{
    readonly focus?: string;
    readonly component?: string;
    readonly action?: string;
  }>();
  const [selected, setSelected] = usePresenceSelection(
    'component',
    params.component ?? componentCreation(params.action),
  );
  if (selected !== null)
    return (
      <ComponentEditor
        key={selected}
        sensor={sensor}
        selected={selected}
        close={() => {
          setSelected(null);
        }}
      />
    );
  return (
    <View className="gap-section-gap">
      <ComponentList sensor={sensor} select={setSelected} />
      <AddComponents sensor={sensor} select={setSelected} />
      <BthomeDiscovery sensor={sensor} select={setSelected} />
      <ManagementActions sensor={sensor} page="presence-components" />
    </View>
  );
}

function UnavailableComponent({ close }: { readonly close: () => void }): ReactNode {
  return (
    <View className="gap-3">
      <Text>This component is unavailable.</Text>
      <Button label="Back" variant="text" onPress={close} />
    </View>
  );
}

function componentCreation(action: string | undefined): string | null {
  switch (action) {
    case 'virtual_add':
      return 'virtual-new';
    case 'bthome_add_device':
      return 'device-new';
    case 'bthome_add_sensor':
      return 'sensor-new';
    case undefined:
    default:
      return null;
  }
}
