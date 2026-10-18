import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { LockLine } from '../screens/detail-parts';
import {
  activeBars,
  connectionTitle,
  linkText,
  signalWord,
  type NetworkSection,
} from './network-model';
import { SignalMeter } from './signal-meter';

function Headline({
  network,
  title,
  live,
  offline,
}: {
  readonly network: NetworkSection;
  readonly title: string;
  readonly live: boolean;
  readonly offline: boolean;
}): ReactNode {
  const bars = offline ? 0 : activeBars(network);
  const link =
    network.kind === 'wifi' && network.wifi !== null ? linkText(network.wifi, live) : null;
  const words = [offline ? 'No reading while offline' : signalWord(bars), link]
    .filter((part) => part !== null)
    .join(' · ');
  return (
    <View className="flex-row items-center gap-4">
      <SignalMeter bars={bars} large name={title} />
      <View className="min-w-0 flex-1">
        <Text variant="title-3" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {words}
        </Text>
      </View>
    </View>
  );
}

function Chips({ network }: { readonly network: NetworkSection }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Badge
        label={network.vpn ? 'VPN on' : 'VPN off'}
        icon="shield"
        tone={network.vpn ? 'info' : 'neutral'}
      />
      <Badge
        label={network.metered ? 'Metered' : 'Not metered'}
        tone={network.metered ? 'warning' : 'neutral'}
      />
      {network.airplane ? <Badge label="Airplane mode on" icon="warning" tone="warning" /> : null}
    </View>
  );
}

export function ConnectionCard({
  network,
  showName,
  live,
  person,
  offline,
}: {
  readonly network: NetworkSection;
  readonly showName: boolean;
  readonly live: boolean;
  readonly person: string;
  readonly offline: boolean;
}): ReactNode {
  const title = connectionTitle(network, showName);
  return (
    <Card title="Connection" icon={network.kind === 'offline' ? 'wifiOff' : 'wifi'}>
      <Headline network={network} title={title} live={live} offline={offline} />
      <Chips network={network} />
      {network.kind === 'wifi' && !showName ? (
        <LockLine text={`The Wi-Fi name stays with ${person}`} />
      ) : null}
    </Card>
  );
}
