import type { ReactNode } from 'react';
import type { BluetoothDevice, ComputerParts } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { sameJson } from '../../../store/same-json';
import { useComputerSelect } from '../data/computer-metrics';
import { useSystemChange } from '../data/computer-system';
import { bluetoothDeviceLine, bluetoothLine, bluetoothOrder } from './network-model';

interface BluetoothFacts {
  readonly enabled: boolean;
  readonly devices: readonly BluetoothDevice[];
}

function bluetoothFactsOf(parts: ComputerParts): BluetoothFacts | null {
  return parts.system?.bluetooth ?? null;
}

export function BluetoothCard({
  deviceId,
  offline,
}: {
  readonly deviceId: string;
  readonly offline: boolean;
}): ReactNode {
  const facts = useComputerSelect(deviceId, bluetoothFactsOf, sameJson);
  const change = useSystemChange(deviceId);
  if (facts === null) return null;
  const blocked = offline || change.isPending;
  return (
    <List title="Bluetooth">
      <SwitchRow
        title="Bluetooth"
        subtitle={bluetoothLine(facts.enabled, facts.devices)}
        value={facts.enabled}
        disabled={blocked}
        onChange={(enabled) => {
          change.mutate({ action: 'bluetooth', enabled });
        }}
      />
      {facts.enabled
        ? bluetoothOrder(facts.devices).map((device) => (
            <ListRow
              key={device.id}
              title={device.name}
              subtitle={bluetoothDeviceLine(device)}
              icon="bluetooth"
              trailing={
                <Button
                  label={device.connected ? 'Disconnect' : 'Connect'}
                  variant="tonal"
                  disabled={blocked}
                  onPress={() => {
                    change.mutate({
                      action: 'bluetooth_device',
                      device: device.id,
                      connected: !device.connected,
                    });
                  }}
                />
              }
            />
          ))
        : null}
    </List>
  );
}
