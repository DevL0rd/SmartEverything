import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { ListRow } from '../../components/list-row';
import { ActionRow } from '../../components/rows';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { PowerToggle } from '../../features/devices';
import { useDevices, useRow } from '../../store/selectors';
import type { Device } from '../../store/state';
import { useWizDiscovery } from './discovery';

export function WizSettings(): ReactNode {
  const plugin = useRow('plugins', 'wiz');
  const devices = useDevices({ includeHidden: true }).filter(
    (device) => device.details['pluginId'] === 'wiz',
  );
  const { state, discover } = useWizDiscovery();
  const running = plugin?.status === 'running';
  return (
    <View className="gap-3">
      <List
        inset
        title="WiZ lights"
        footer="In the WiZ app, connect the lights to Wi-Fi, enable Local network communication and set Security to Allow all controls. Your server must be on the same network."
      >
        <ActionRow
          icon="search"
          title={state.phase === 'scanning' ? 'Discovering devices…' : 'Discover devices'}
          subtitle={running ? 'Find WiZ lights on your home network' : 'Switch WiZ on first'}
          disabled={!running || state.phase === 'scanning'}
          onPress={() => {
            void discover();
          }}
        />
        {devices.map((device) => (
          <WizLight key={device.id} device={device} />
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

function WizLight({ device }: { readonly device: Device }): ReactNode {
  return (
    <ListRow
      icon="bulb"
      title={device.label}
      subtitle={`${device.online ? 'Online' : 'Offline'} · ${device.model}`}
      href={href.device(device)}
      chevron
      trailing={<PowerToggle device={device} />}
    />
  );
}
