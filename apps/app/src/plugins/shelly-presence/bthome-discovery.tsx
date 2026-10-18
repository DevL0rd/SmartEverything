import type { ReactNode } from 'react';
import type { ShellyDevice } from '@smarteverything/shelly';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';

export function BthomeDiscovery({
  sensor,
  add,
}: {
  readonly sensor: ShellyDevice;
  readonly add: (address: string) => void;
}): ReactNode {
  return sensor.discoveredBthome.length === 0 ? null : (
    <List title="Discovered Bluetooth devices">
      {sensor.discoveredBthome.map((device) => (
        <NavRow
          key={device.addr}
          title={device.local_name ?? device.addr}
          subtitle={`${device.addr} · ${String(device.rssi)} dBm${device.encrypted ? ' · Encrypted' : ''}`}
          onPress={() => {
            add(device.addr);
          }}
        />
      ))}
    </List>
  );
}
