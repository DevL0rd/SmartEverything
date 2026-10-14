import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SHELLY_BTHOME_COMPONENT, type ShellyPresenceDevice } from '@smarteverything/domain';
import { SwitchRow, NavRow, ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import { usePresenceOperation } from './use-presence-operation';
import { OperationFeedback } from './operation-feedback';
import { presenceActionAvailable } from './availability';

export function BthomeDiscovery({
  sensor,
  select,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly select: (key: string) => void;
}): ReactNode {
  const operation = usePresenceOperation(sensor);
  const parsed = SHELLY_BTHOME_COMPONENT.safeParse(
    sensor.components.find((entry) => entry.component === 'bthome'),
  );
  const root = parsed.success && parsed.data.component === 'bthome' ? parsed.data : null;
  const discovery = root?.status?.discovery;
  return (
    <View className="gap-3">
      {root?.config.enable === undefined ? null : (
        <SwitchRow
          title="Bluetooth Home enabled"
          value={root.config.enable}
          disabled={!presenceActionAvailable(sensor, 'bthome_set_config')}
          onChange={(enable) => {
            void operation.run({ action: 'bthome_set_config', config: { enable } });
          }}
        />
      )}
      {discovery === undefined ? null : (
        <ValueRow
          title="Discovery window"
          value={`${new Date(discovery.started_at * 1000).toLocaleString()} · ${String(discovery.duration)} seconds`}
        />
      )}
      {sensor.discoveredBthome.length === 0 ? null : (
        <List title="Discovered Bluetooth devices">
          {sensor.discoveredBthome.map((device) => (
            <NavRow
              key={device.addr}
              title={device.local_name ?? device.addr}
              subtitle={`${device.addr} · ${String(device.rssi)} dBm${device.encrypted ? ' · Encrypted' : ''}`}
              onPress={() => {
                select(`device-new:${device.addr}`);
              }}
            />
          ))}
        </List>
      )}
      <OperationFeedback operation={operation} />
    </View>
  );
}
