import {
  formatByteRate,
  formatMegabits,
  type NetworkClient,
  type RouterSnapshot,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { CopyButton } from '../../../components/copy-button';
import { SignalBars } from '../../../components/signal-bars';
import { signalOf as signalLevelOf } from '../../../components/signal-level';
import { ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { ListRow } from '../../../components/list-row';
import { signed } from '../../../format/number';
import { shortDate, moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { ServiceMedallion } from '../../shared/service-medallion';
import type { MedallionTone } from '../../shared/medallion-model';
import { connectionText } from '../client-model';
import { clientGlyph } from './client-glyph';

function leadOf(client: NetworkClient): { readonly text: string; readonly tone: MedallionTone } {
  if (client.blocked) {
    return { text: 'Blocked', tone: 'critical' };
  }
  return client.connected
    ? { text: `Online · ${connectionText(client)}`, tone: 'positive' }
    : { text: 'Offline', tone: 'neutral' };
}

export function ClientLead({ client }: { readonly client: NetworkClient }): ReactNode {
  const { text, tone } = leadOf(client);
  return (
    <View className="flex-row items-center gap-3">
      <ServiceMedallion
        glyph={clientGlyph(client)}
        tone={tone}
        ratio={null}
        live={false}
        size="widget"
        label={text}
        offline={!client.connected}
      />
      <Text variant="callout" tone="variant" className="flex-1">
        {text}
      </Text>
    </View>
  );
}

function Reading({
  value,
  caption,
}: {
  readonly value: string;
  readonly caption: string;
}): ReactNode {
  return (
    <View>
      <Text variant="callout">{value}</Text>
      <Text variant="caption" tone="variant">
        {caption}
      </Text>
    </View>
  );
}

type Station = RouterSnapshot['stations'][number];

function WifiReadings({ station }: { readonly station: Station }): ReactNode {
  const { rssiDbm } = station;
  return (
    <View className="flex-row items-center gap-2">
      <SignalBars dbm={rssiDbm} decorative />
      <Reading
        value={rssiDbm === null ? 'No signal reading' : `Signal ${signalLevelOf(rssiDbm).quality}`}
        caption={rssiDbm === null ? 'Unknown' : `${signed(rssiDbm)} dBm`}
      />
    </View>
  );
}

function stationOf(client: NetworkClient, snapshot: RouterSnapshot): Station | undefined {
  return client.connection === 'wifi'
    ? snapshot.stations.find((candidate) => candidate.mac === client.mac)
    : undefined;
}

export function ClientLive({
  client,
  snapshot,
}: {
  readonly client: NetworkClient;
  readonly snapshot: RouterSnapshot;
}): ReactNode {
  const station = stationOf(client, snapshot);
  const bytes = client.trafficBytesPerSecond ?? 0;
  if (!client.connected || (station === undefined && bytes === 0)) {
    return null;
  }
  return (
    <Card>
      <View className="flex-row flex-wrap items-center gap-x-6 gap-y-3">
        {station === undefined ? null : <WifiReadings station={station} />}
        <Reading
          value={bytes > 0 ? formatByteRate(bytes) : 'Idle'}
          caption={bytes > 0 ? 'now' : 'no traffic'}
        />
        {station === undefined || station.phyMbps === 0 ? null : (
          <Reading value={formatMegabits(station.phyMbps)} caption="Link speed" />
        )}
      </View>
    </Card>
  );
}

function Copyable({ title, value }: { readonly title: string; readonly value: string }): ReactNode {
  return (
    <ListRow
      title={title}
      subtitle={value}
      trailing={<CopyButton value={value} label={`Copy ${title.toLowerCase()}`} what={title} />}
    />
  );
}

export function ClientDetails({ client }: { readonly client: NetworkClient }): ReactNode {
  const now = useMinute();
  return (
    <List>
      {client.ip === null ? null : <Copyable title="Address" value={client.ip} />}
      <Copyable title="Hardware address" value={client.mac} />
      {client.firstSeen === null ? null : (
        <ValueRow title="First seen" value={shortDate(client.firstSeen)} />
      )}
      {client.lastSeen === null || client.connected ? null : (
        <ValueRow title="Last seen" value={moment(client.lastSeen, now)} />
      )}
    </List>
  );
}
