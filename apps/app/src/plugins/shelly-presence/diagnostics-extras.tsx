import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyDevice } from '@smarteverything/shelly';
import { ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import { DeviceHealth } from './device-health';
import { DeviceIdentity } from './device-identity';
import { ReauthPrompt } from './reauth-prompt';

export function DiagnosticsExtras({ sensor }: { readonly sensor: ShellyDevice }): ReactNode {
  return (
    <View className="gap-section-gap">
      <ReauthPrompt sensor={sensor} />
      <DeviceIdentity sensor={sensor} />
      <DeviceHealth sensor={sensor} />
      <List title="Connection">
        <ValueRow title="Status" value={sensor.connection.state} />
        <ValueRow title="Firmware" value={sensor.info.ver} />
        <ValueRow title="Last observed" value={sensor.observedAt ?? 'Unknown'} />
        {sensor.connection.reason === null ? null : (
          <ValueRow title="Problem" value={sensor.connection.reason} />
        )}
      </List>
      <List title="Sensor faults">
        {(sensor.status?.errors ?? []).map((error) => (
          <ValueRow key={error} title={error} value="Sensor reported" />
        ))}
      </List>
      <List title="Component inventory">
        {sensor.componentKeys.map((key) => (
          <ValueRow key={key} title={key} value="Discovered" />
        ))}
      </List>
    </View>
  );
}
