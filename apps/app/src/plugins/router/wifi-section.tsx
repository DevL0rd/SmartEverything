import { usePluginScreen } from '../shared/plugin-log';
import type { RouterSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { ProgressBar } from '../../components/charts/progress-bar';
import { EmptyState } from '../../components/empty-state';
import { Icon } from '../../components/icon';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { Text } from '../../components/text';
import { decimal, percent } from '../../format/number';
import { plural } from '../../format/text';
import { PluginStreamSection } from '../shared/plugin-stream-section';
import { usePluginDevice } from '../shared/use-plugin-device';
import { bandCounts } from './client-model';
import { airtimeOf } from './clients/airtime';
import { routerSectionHref } from './overview/links';
import { routerNotice, useRouterSnapshot } from './router-data';

type Radio = RouterSnapshot['radios'][number];

function Fact({ label, value }: { readonly label: string; readonly value: string }): ReactNode {
  return (
    <View className="min-w-32 flex-1 basis-32">
      <Text variant="footnote" tone="variant">
        {label}
      </Text>
      <Text variant="callout">{value}</Text>
    </View>
  );
}

function Facts({ radio }: { readonly radio: Radio }): ReactNode {
  const channel =
    radio.channel === null
      ? null
      : radio.width === null
        ? String(radio.channel)
        : `${String(radio.channel)} · ${radio.width}`;
  return (
    <View className="flex-row flex-wrap gap-x-4 gap-y-3">
      {channel === null ? null : <Fact label="Channel" value={channel} />}
      {radio.noiseDbm === null ? null : (
        <Fact label="Noise" value={`${decimal(radio.noiseDbm)} dBm`} />
      )}
      {radio.temperatureCelsius === null ? null : (
        <Fact label="Radio" value={`${decimal(radio.temperatureCelsius)} °C`} />
      )}
      {radio.dfs === null ? null : <Fact label="Radar check (DFS)" value={radio.dfs} />}
    </View>
  );
}

function Airtime({ busyPercent }: { readonly busyPercent: number }): ReactNode {
  const { tone, word } = airtimeOf(busyPercent);
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-2">
        <Text variant="callout" tone="variant" className="flex-1">
          Airtime busy
        </Text>
        {tone === 'info' ? null : <Icon name="warning" size={16} tone={tone} />}
        <Text variant="callout" tone={tone === 'info' ? 'default' : tone}>
          {`${percent(busyPercent / 100)} · ${word}`}
        </Text>
      </View>
      <ProgressBar progress={busyPercent / 100} colour={tone} label={`Airtime busy, ${word}`} />
    </View>
  );
}

function DevicesLink({
  band,
  devices,
}: {
  readonly band: string;
  readonly devices: number;
}): ReactNode {
  const router = usePluginDevice('router');
  const label = `${plural(devices, 'device')} ›`;
  return router === null ? (
    <Text variant="callout" tone="variant">
      {label}
    </Text>
  ) : (
    <Button
      label={label}
      variant="text"
      href={routerSectionHref(router.id, 'clients', { filter: 'wifi', band })}
    />
  );
}

function RadioCard({
  radio,
  devices,
}: {
  readonly radio: Radio;
  readonly devices: number;
}): ReactNode {
  const name = radio.ssid === null ? radio.band : `${radio.band} · ${radio.ssid}`;
  if (radio.enabled === false) {
    return (
      <List>
        <ListRow title={name} icon="wifi" iconTone="faint" value="Off" />
      </List>
    );
  }
  return (
    <Card>
      <View className="flex-row items-center gap-2">
        <Text variant="title-3" accessibilityRole="header" className="flex-1">
          {radio.band}
        </Text>
        <DevicesLink band={radio.band} devices={devices} />
      </View>
      {radio.ssid === null ? null : (
        <Text variant="body-strong" numberOfLines={2}>
          {radio.ssid}
        </Text>
      )}
      {radio.airtimeBusyPercent === null ? null : (
        <Airtime busyPercent={radio.airtimeBusyPercent} />
      )}
      <Facts radio={radio} />
    </Card>
  );
}

function Radios({ snapshot }: { readonly snapshot: RouterSnapshot }): ReactNode {
  const devices = bandCounts(snapshot.clients);
  return (
    <View className="flex-row flex-wrap gap-section-gap">
      {snapshot.radios.map((radio) => (
        <View key={radio.band} className="min-w-72 flex-1 basis-72">
          <RadioCard radio={radio} devices={devices.get(radio.band) ?? 0} />
        </View>
      ))}
    </View>
  );
}

export function WifiSection(): ReactNode {
  usePluginScreen('router', 'WifiSection');
  return (
    <PluginStreamSection stream={useRouterSnapshot()} pluginId="router" notice={routerNotice}>
      {(snapshot) =>
        snapshot.radios.length === 0 ? (
          <EmptyState
            icon="wifi"
            title="No Wi-Fi details yet"
            body="They appear after the router’s first full read."
          />
        ) : (
          <Radios snapshot={snapshot} />
        )
      }
    </PluginStreamSection>
  );
}
