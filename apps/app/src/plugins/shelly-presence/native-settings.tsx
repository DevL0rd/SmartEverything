import { DeviceHealth } from './device-health';
import { DeviceIdentity } from './device-identity';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  SHELLY_PRESENCE_CORE_FIELDS,
  SHELLY_PRESENCE_ZONE_FIELDS,
  type ShellyPresenceDevice,
  type ShellyPresencePage,
} from '@smarteverything/domain';
import { Card } from '../../components/card';
import { List } from '../../components/section';
import { ValueRow } from '../../components/rows';
import { Text } from '../../components/text';
import { CoreForm, PresenceActionButton } from './core-form';
import { presenceActionAvailable } from './availability';
import { revisionOf } from './presence-data';
import { AdvancedSettings } from './advanced-settings';

function LightSettings({ sensor }: { readonly sensor: ShellyPresenceDevice }): ReactNode {
  return sensor.light.map((light) => (
    <Card key={light.config.id} title={light.config.name ?? 'Light sensor'}>
      <CoreForm
        sensor={sensor}
        fields={SHELLY_PRESENCE_ZONE_FIELDS.filter((field) => field.component === 'illuminance')}
        accepted={light.config}
        action="set_light"
      />
    </Card>
  ));
}

function CoreSettings({
  sensor,
  page,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly page: ShellyPresencePage;
}): ReactNode {
  const fields = SHELLY_PRESENCE_CORE_FIELDS.filter((field) => field.page === page);
  return (
    <View className="gap-section-gap">
      {sensor.config === null ? (
        <Text tone="variant">Detection configuration is not available.</Text>
      ) : (
        <Card>
          <CoreForm
            sensor={sensor}
            fields={fields}
            accepted={sensor.config}
            action="set_presence"
          />
        </Card>
      )}
      {page === 'presence-detection' && presenceActionAvailable(sensor, 'calibrate') ? (
        <PresenceActionButton
          sensor={sensor}
          label="Calibrate tilt"
          action={{ action: 'calibrate', ...revisionOf(sensor) }}
        />
      ) : null}
      {page !== 'presence-tuning' ? null : (
        <Text variant="footnote" tone="variant">
          Custom thresholds are saved separately from sensitivity presets. A preset may replace
          these values.
        </Text>
      )}
      {page === 'presence-light' ? <LightSettings sensor={sensor} /> : null}
    </View>
  );
}

function Diagnostics({ sensor }: { readonly sensor: ShellyPresenceDevice }): ReactNode {
  return (
    <View className="gap-section-gap">
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
      <PresenceActionButton sensor={sensor} label="Refresh device" action={{ action: 'refresh' }} />
      <PresenceActionButton
        sensor={sensor}
        label="Reconnect device"
        action={{ action: 'reconnect' }}
      />
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
      <AdvancedSettings sensor={sensor} page="presence-diagnostics" />
    </View>
  );
}

export function PresenceNativeSettings({
  sensor,
  page,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly page: ShellyPresencePage;
}): ReactNode {
  if (page === 'presence-detection' || page === 'presence-tuning' || page === 'presence-light')
    return <CoreSettings sensor={sensor} page={page} />;
  if (page === 'presence-diagnostics') return <Diagnostics sensor={sensor} />;
  return <AdvancedSettings sensor={sensor} page={page} />;
}
