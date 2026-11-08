import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveAlbum, SmartRule } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { LoadedItems } from './album-data';
import { statsOf } from './album-items';
import { itemsText, leafIcon, leafText, ruleLead, visibilityOf } from './model';

const UNKNOWN = '–';

function Stat({
  value,
  label,
  icon,
}: {
  readonly value: string;
  readonly label: string;
  readonly icon?: IconName;
}): ReactNode {
  return (
    <View className="min-w-24 gap-0.5">
      <View className="flex-row items-center gap-1.5">
        {icon === undefined ? null : <Icon name={icon} size={16} tone="variant" />}
        <Text variant="callout" className="tabular-nums font-sans-medium">
          {value}
        </Text>
      </View>
      <Text variant="caption" tone="variant">
        {label}
      </Text>
    </View>
  );
}

export function AlbumStatsCard({
  album,
  loaded,
}: {
  readonly album: DriveAlbum;
  readonly loaded: LoadedItems;
}): ReactNode {
  const stats = loaded.complete ? statsOf(loaded.items) : null;
  const who = visibilityOf(album.scope);
  return (
    <View className="flex-row flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border-hairline border-outline-variant bg-surface-1 px-5 py-4">
      <View className="min-w-24 gap-0.5">
        <Text variant="title-2" className="tabular-nums">
          {itemsText(album.itemCount)}
        </Text>
        <Text variant="caption" tone="variant" className="tabular-nums">
          {stats?.split ?? UNKNOWN}
        </Text>
      </View>
      <Stat value={stats?.span ?? UNKNOWN} label="first and latest photo" />
      <Stat value={who.label} label="who sees it" icon={who.icon} />
      <Stat value={stats?.size ?? UNKNOWN} label="on the hub" />
      {album.kind === 'smart' ? (
        <View className="flex-1 flex-row justify-end">
          <Badge label="Smart album" icon="sparkles" tone="primary" />
        </View>
      ) : null}
    </View>
  );
}

export function RuleLine({
  rule,
  onEdit,
}: {
  readonly rule: SmartRule;
  readonly onEdit: () => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text variant="footnote" tone="variant">
        {ruleLead(rule)}
      </Text>
      {rule.rules.map((leaf, index) => (
        <Badge key={`${leaf.kind}-${String(index)}`} label={leafText(leaf)} icon={leafIcon(leaf)} />
      ))}
      <Button label="Edit rules" icon="pencil" variant="text" onPress={onEdit} />
    </View>
  );
}
