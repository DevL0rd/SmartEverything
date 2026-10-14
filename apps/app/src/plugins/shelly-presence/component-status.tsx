import type { ShellySystemComponent } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { ValueRow } from '../../components/rows';
import { List } from '../../components/section';

type ComponentOf<K extends ShellySystemComponent['component']> = Extract<
  ShellySystemComponent,
  { readonly component: K }
>;
function numberText(value: number | undefined, unit = ''): string {
  return value === undefined ? 'Unknown' : `${String(value)}${unit}`;
}
function booleanText(value: boolean | undefined, yes: string, no: string): string {
  return value === undefined ? 'Unknown' : value ? yes : no;
}

function WifiStatus({ component }: { readonly component: ComponentOf<'wifi'> }): ReactNode {
  return (
    <List title="Current network">
      <ValueRow title="Network" value={component.status?.ssid ?? 'Unknown'} />
      <ValueRow title="Signal" value={numberText(component.status?.rssi, ' dBm')} />
      <ValueRow title="Address" value={component.status?.sta_ip ?? 'Unknown'} />
    </List>
  );
}
function SystemStatus({ component }: { readonly component: ComponentOf<'sys'> }): ReactNode {
  return (
    <List title="Device health">
      <ValueRow title="Clock" value={component.status?.time ?? 'Not synchronized'} />
      <ValueRow title="Uptime" value={numberText(component.status?.uptime, ' seconds')} />
      <ValueRow
        title="Restart"
        value={booleanText(component.status?.restart_required, 'Required', 'Not required')}
      />
    </List>
  );
}
function MatterStatus({ component }: { readonly component: ComponentOf<'matter'> }): ReactNode {
  return (
    <List title="Matter status">
      <ValueRow title="Fabrics" value={numberText(component.status?.num_fabrics)} />
      <ValueRow
        title="Commissioning"
        value={booleanText(component.status?.commissionable, 'Available', 'Closed')}
      />
    </List>
  );
}

export function ComponentStatus({
  component,
}: {
  readonly component: ShellySystemComponent;
}): ReactNode {
  switch (component.component) {
    case 'wifi':
      return <WifiStatus component={component} />;
    case 'sys':
      return <SystemStatus component={component} />;
    case 'matter':
      return <MatterStatus component={component} />;
    case 'ble':
    case 'zigbee':
      return <RadioStatus component={component} />;
    case 'mqtt':
    case 'cloud':
    case 'ws':
      return <ConnectionStatus component={component} />;
  }
}
function RadioStatus({
  component,
}: {
  readonly component: ComponentOf<'ble'> | ComponentOf<'zigbee'>;
}): ReactNode {
  switch (component.component) {
    case 'ble':
      return (
        <List title="Bluetooth status">
          <ValueRow title="Paired devices" value={numberText(component.status?.paired_devices)} />
        </List>
      );
    case 'zigbee':
      return (
        <List title="Zigbee status">
          <ValueRow title="Network" value={component.status?.network_state ?? 'Unknown'} />
        </List>
      );
  }
}
function ConnectionStatus({
  component,
}: {
  readonly component: ComponentOf<'mqtt'> | ComponentOf<'cloud'> | ComponentOf<'ws'>;
}): ReactNode {
  return (
    <List>
      <ValueRow
        title="Connection"
        value={booleanText(component.status?.connected, 'Connected', 'Disconnected')}
      />
    </List>
  );
}
