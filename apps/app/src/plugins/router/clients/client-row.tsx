import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { Interactive } from '../../../components/interactive';
import { SignalBars } from '../../../components/signal-bars';
import { signalOf } from '../../../components/signal-level';
import { StatusChip } from '../../../components/status-chip';
import { Text } from '../../../components/text';
import { joinParts } from '../../../format/text';
import type { ClientEntry } from '../client-model';
import { clientGlyph } from './client-glyph';

function labelOf({ client, subtitle, dbm, rate }: ClientEntry): string {
  return joinParts([
    client.name,
    client.connected ? 'online' : 'offline',
    client.blocked && 'blocked',
    subtitle,
    client.connection === 'wifi' && dbm !== null && signalOf(dbm).label,
    rate,
  ]);
}

function Readings({ entry }: { readonly entry: ClientEntry }): ReactNode {
  const { client, dbm, rate } = entry;
  if (rate === null && !(client.connection === 'wifi' && client.connected && dbm !== null)) {
    return null;
  }
  return (
    <View className="shrink-0 flex-row items-center gap-2">
      {rate === null ? null : (
        <Text variant="footnote" tone="variant" className="tabular">
          {rate}
        </Text>
      )}
      {client.connection === 'wifi' && dbm !== null ? <SignalBars dbm={dbm} decorative /> : null}
    </View>
  );
}

export function ClientRow({
  entry,
  onPress,
}: {
  readonly entry: ClientEntry;
  readonly onPress: () => void;
}): ReactNode {
  const { client, subtitle } = entry;
  return (
    <Interactive
      label={labelOf(entry)}
      onPress={onPress}
      className="min-h-row-h-2 flex-row items-center gap-4 px-4 py-2"
    >
      <IconWell
        icon={clientGlyph(client)}
        colour={client.connected ? 'primary' : 'on-surface-variant'}
        size="m"
      />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body" numberOfLines={1}>
          {client.name}
        </Text>
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
          <Text variant="callout" tone="variant" numberOfLines={1} className="shrink">
            {subtitle}
          </Text>
          {client.blocked ? <StatusChip status="blocked" label="Blocked" /> : null}
        </View>
      </View>
      <Readings entry={entry} />
      <Icon name="chevronRight" size={20} tone="faint" />
    </Interactive>
  );
}
