import type { ShellyBthomeComponent } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { ValueRow } from '../../components/rows';
import { List } from '../../components/section';

function numberText(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Unknown' : String(value);
}
function flagText(value: boolean | undefined): string {
  return value === undefined ? 'Unknown' : value ? 'Yes' : 'No';
}

function DeviceStatus({ component }: { readonly component: ShellyBthomeComponent }): ReactNode {
  if (component.component !== 'bthomedevice') return null;
  const status = component.status;
  if (status === null) return <ValueRow title="Bluetooth device status" value="Unknown" />;
  return (
    <List title="Bluetooth device">
      <ValueRow title="Signal (dBm)" value={numberText(status.rssi)} />
      <ValueRow title="Battery (%)" value={numberText(status.battery)} />
      <ValueRow title="Packet" value={numberText(status.packet_id)} />
      <ValueRow title="Last updated" value={numberText(status.last_update_ts)} />
      <ValueRow title="Paired" value={flagText(status.paired)} />
      <ValueRow title="RPC available" value={flagText(status.rpc)} />
      <ValueRow title="Firmware" value={status.fw_ver ?? 'Unknown'} />
      <ValueRow title="Errors" value={(status.errors ?? []).join(', ')} />
    </List>
  );
}

export function BthomeStatus({
  component,
}: {
  readonly component: ShellyBthomeComponent;
}): ReactNode {
  if (component.component !== 'bthomesensor') return <DeviceStatus component={component} />;
  const value = component.status?.value;
  return (
    <List title="Bluetooth sensor">
      <ValueRow
        title="Value"
        value={value === undefined || value === null ? 'Unknown' : String(value)}
      />
      <ValueRow title="Last updated" value={numberText(component.status?.last_update_ts)} />
    </List>
  );
}
