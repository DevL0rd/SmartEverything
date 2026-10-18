import type { ReactNode } from 'react';
import type { ComputerParts, WifiNetwork } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { ListRow } from '../../../components/list-row';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { SignalBars } from '../../../components/signal-bars';
import { sameJson } from '../../../store/same-json';
import { useComputerSelect } from '../data/computer-metrics';
import { useSystemChange } from '../data/computer-system';
import { dbmOfPercent, isOnlyWifiLink, knownNetworks, wifiLine } from './network-model';

interface WifiFacts {
  readonly enabled: boolean;
  readonly networks: readonly WifiNetwork[];
  readonly onlyLink: boolean;
}

function wifiFactsOf(parts: ComputerParts): WifiFacts | null {
  const wifi = parts.system?.wifi;
  if (wifi === undefined || wifi === null) return null;
  return {
    enabled: wifi.enabled,
    networks: wifi.networks,
    onlyLink: isOnlyWifiLink(parts.network?.interfaces ?? []),
  };
}

function cutOffGuard(
  name: string,
  onlyLink: boolean,
): (title: string, confirmLabel: string, run: () => void) => void {
  return (title: string, confirmLabel: string, run: () => void): void => {
    if (!onlyLink) {
      run();
      return;
    }
    const body = `${name} reaches this app over Wi-Fi. If the link drops, it goes offline here until Wi-Fi is back.`;
    background(
      confirm({ title, body, confirmLabel, tone: 'destructive' }).then((yes) => {
        if (yes) run();
      }),
      'network.confirm_failed',
    );
  };
}

function SavedNetwork({
  network,
  disabled,
  onConnect,
}: {
  readonly network: WifiNetwork;
  readonly disabled: boolean;
  readonly onConnect: () => void;
}): ReactNode {
  return (
    <ListRow
      title={network.ssid}
      subtitle={network.connected ? 'Connected' : 'Saved'}
      leading={<SignalBars dbm={dbmOfPercent(network.signalPercent)} />}
      trailing={
        network.connected ? undefined : (
          <Button label="Connect" variant="tonal" disabled={disabled} onPress={onConnect} />
        )
      }
    />
  );
}

export function WifiCard({
  deviceId,
  name,
  offline,
}: {
  readonly deviceId: string;
  readonly name: string;
  readonly offline: boolean;
}): ReactNode {
  const facts = useComputerSelect(deviceId, wifiFactsOf, sameJson);
  const change = useSystemChange(deviceId);
  const guard = cutOffGuard(name, facts?.onlyLink ?? false);
  if (facts === null) return null;
  const blocked = offline || change.isPending;
  return (
    <List title="Wi-Fi">
      <SwitchRow
        title="Wi-Fi"
        subtitle={wifiLine(facts.enabled, facts.networks)}
        value={facts.enabled}
        disabled={blocked}
        onChange={(enabled) => {
          const apply = (): void => {
            change.mutate({ action: 'wifi', enabled });
          };
          if (enabled) apply();
          else guard('Turn off Wi-Fi?', 'Turn off Wi-Fi', apply);
        }}
      />
      {facts.enabled
        ? knownNetworks(facts.networks).map((network) => (
            <SavedNetwork
              key={network.ssid}
              network={network}
              disabled={blocked}
              onConnect={() => {
                guard(`Switch Wi-Fi to ${network.ssid}?`, 'Switch network', () => {
                  change.mutate({ action: 'wifi_connect', network: network.ssid });
                });
              }}
            />
          ))
        : null}
    </List>
  );
}
