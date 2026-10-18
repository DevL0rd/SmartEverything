import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { PowerToggle } from '../../features/devices/controls/power-toggle';
import { useDevices, useRow } from '../../store/selectors';
import type { Device } from '../../store/state';
import { useWizDiscovery } from './discovery';
import { background } from '@smarteverything/logging';

export const WIZ_DISCOVER = 'discover';
export const WIZ_LIGHTS = 'lights';

export function WizSettings(): ReactNode {
  const plugin = useRow('plugins', 'wiz');
  const devices = useDevices({ includeHidden: true }).filter(
    (device) => device.details['pluginId'] === 'wiz',
  );
  const { state, discover } = useWizDiscovery();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const running = plugin?.status === 'running';
  return (
    <View className="gap-3">
      <List
        inset
        title="WiZ lights"
        footer="In the WiZ app, connect the lights to Wi-Fi, enable Local network communication and set Security to Allow all controls. Your server must be on the same network."
      >
        <ListRow
          selected={focus === WIZ_DISCOVER}
          icon="search"
          title={state.phase === 'scanning' ? 'Discovering devices…' : 'Discover devices'}
          subtitle={running ? 'Find WiZ lights on your home network' : 'Switch WiZ on first'}
          disabled={!running || state.phase === 'scanning'}
          onPress={() => {
            background(discover(), 'settings.discover_failed');
          }}
        />
        {devices.map((device) => (
          <WizLight
            key={device.id}
            device={device}
            running={running}
            selected={focus === WIZ_LIGHTS}
          />
        ))}
      </List>
      {!running || state.phase === 'idle' || state.phase === 'scanning' ? null : (
        <Text
          variant="callout"
          tone={state.phase === 'failed' ? 'critical' : 'variant'}
          accessibilityLiveRegion="polite"
        >
          {state.message}
        </Text>
      )}
    </View>
  );
}

function lightStatus(device: Device, running: boolean): string {
  if (!running) return 'Unavailable';
  return device.online ? 'Online' : 'Offline';
}

function WizLight({
  device,
  running,
  selected,
}: {
  readonly device: Device;
  readonly running: boolean;
  readonly selected: boolean;
}): ReactNode {
  return (
    <ListRow
      selected={selected}
      icon="bulb"
      title={device.label}
      subtitle={`${lightStatus(device, running)} · ${device.model}`}
      href={href.device(device)}
      chevron
      trailing={running ? <PowerToggle device={device} /> : null}
    />
  );
}
