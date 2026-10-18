import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { List } from '../../../components/section';
import { ListRow } from '../../../components/list-row';
import { isLocalScale } from '../../../store/people';
import { useDevices } from '../../../store/selectors';
import { HEALTH_CONNECT_ON_DEVICE, type HealthConnectStatus } from '../data/health-connect';
import { useThisPhoneSource } from '../data/this-phone';
import { useHealthConnect } from '../data/use-health-connect';

function healthConnectText(status: HealthConnectStatus, connected: boolean): string {
  switch (status.sdk) {
    case 'unavailable':
      return 'Not available on this phone';
    case 'provider_update_required':
      return 'Update Health Connect from the Play Store';
    case 'available':
      return connected
        ? 'Connected · tap to manage access'
        : 'Tap to connect and choose what to share';
  }
}

function HealthConnectRow(): ReactNode {
  const controls = useHealthConnect();
  const connected = useThisPhoneSource() !== null;
  const status = controls.status.data;
  if (status === undefined) {
    return (
      <ListRow
        title="Health Connect"
        subtitle={controls.status.error === null ? 'Checking…' : 'Couldn’t check Health Connect'}
        icon="heartPulse"
      />
    );
  }
  return (
    <ListRow
      title="Health Connect"
      subtitle={healthConnectText(status, connected)}
      icon="heartPulse"
      href={href.settings.focus('health', 'health-connect')}
      chevron
    />
  );
}

function ScaleRow(): ReactNode {
  const scale = useDevices({ includeHidden: true }).find(isLocalScale);
  return scale === undefined ? (
    <ListRow
      title="Bluetooth scale"
      subtitle="Weight and body composition after every weigh-in"
      icon="scale"
      href={href.connect('scale')}
      chevron
    />
  ) : (
    <ListRow
      title={scale.display_name ?? scale.name}
      subtitle="Set up · weigh-ins arrive by themselves"
      icon="scale"
    />
  );
}

export function SetupConnect(): ReactNode {
  return (
    <View className="gap-4">
      <List>
        {HEALTH_CONNECT_ON_DEVICE ? (
          <HealthConnectRow />
        ) : (
          <ListRow
            title="Health Connect"
            subtitle="Connect it from SmartEverything on your Android phone"
            icon="heartPulse"
          />
        )}
        <ScaleRow />
      </List>
    </View>
  );
}
