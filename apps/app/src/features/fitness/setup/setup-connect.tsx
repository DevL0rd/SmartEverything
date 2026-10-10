import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { List } from '../../../components/section';
import { ListRow } from '../../../components/list-row';
import { isLocalScale } from '../../../store/people';
import { useDevices } from '../../../store/selectors';
import { HEALTH_CONNECT_ON_DEVICE } from '../data/health-connect';
import { useHealthConnect } from '../data/use-health-connect';

function HealthConnectRow(): ReactNode {
  const controls = useHealthConnect();
  const grants = controls.grants.data;
  if (grants === undefined) {
    return (
      <ListRow
        title="Health Connect"
        subtitle={controls.grants.error === null ? 'Checking…' : 'Couldn’t check Health Connect'}
        icon="heartPulse"
      />
    );
  }
  const connected = grants.types.length > 0;
  return (
    <ListRow
      title="Health Connect"
      subtitle={
        connected
          ? 'Connected · steps, sleep, heart and workouts'
          : 'Bring in steps, sleep, heart and workouts'
      }
      icon="heartPulse"
      trailing={
        connected ? null : (
          <Button
            label="Connect"
            variant="tonal"
            loading={controls.busy === 'connect'}
            onPress={controls.connect}
          />
        )
      }
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
