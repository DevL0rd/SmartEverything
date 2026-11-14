import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { DriveItem, DuplicateGroup } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { bytes } from '../../../format/number';
import { useDriveLink } from '../../drive';
import {
  copiesOf,
  copyLabelOf,
  groupLineOf,
  groupSourcesOf,
  itemLineOf,
  sourceOf,
  type SourceLabels,
} from './model';

export interface GroupHandlers {
  readonly onKeepBest: (sha256: string) => void;
  readonly onNotDuplicates: (sha256: string) => void;
  readonly disabled: boolean;
}

interface GroupProps {
  readonly group: DuplicateGroup;
  readonly labels: SourceLabels;
  readonly handlers: GroupHandlers;
}

type ActionProps = Omit<GroupProps, 'labels'>;

function Thumb({
  item,
  keeper,
}: {
  readonly item: DriveItem;
  readonly keeper: boolean;
}): ReactNode {
  const url = useDriveLink(item.id, item.rev, 'thumb');
  return (
    <View
      className={cn(
        'h-full w-full rounded-md border-2 p-0.5',
        keeper ? 'border-positive' : 'border-transparent',
      )}
    >
      <View className="flex-1 items-center justify-center overflow-hidden rounded-sm bg-surface-3">
        {url === null ? (
          <Icon name={item.kind === 'video' ? 'film' : 'image'} size={24} tone="faint" />
        ) : (
          <Image
            source={{ uri: url, cacheKey: `${item.id}:${String(item.rev)}` }}
            contentFit="cover"
            cachePolicy="disk"
            style={StyleSheet.absoluteFill}
            accessible={false}
          />
        )}
      </View>
      {keeper ? (
        <View pointerEvents="none" className="absolute left-2 top-2">
          <Badge label="Keep" tone="positive" icon="check" />
        </View>
      ) : null}
    </View>
  );
}

function WideCopy({
  item,
  keeper,
  labels,
}: {
  readonly item: DriveItem;
  readonly keeper: boolean;
  readonly labels: SourceLabels;
}): ReactNode {
  const source = sourceOf(item, labels);
  return (
    <View accessible accessibilityLabel={copyLabelOf(item, keeper, labels)} className="w-50 gap-1">
      <View className="h-30">
        <Thumb item={item} keeper={keeper} />
      </View>
      <Text variant="label" numberOfLines={1}>
        {item.name}
      </Text>
      <Text variant="caption" tone="variant" className="tabular-nums" numberOfLines={1}>
        {itemLineOf(item)}
      </Text>
      {source === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {source}
        </Text>
      )}
    </View>
  );
}

function KeepBestButton({ group, handlers }: ActionProps): ReactNode {
  return (
    <Button
      label="Keep best"
      variant="tonal"
      disabled={handlers.disabled}
      onPress={() => {
        handlers.onKeepBest(group.sha256);
      }}
    />
  );
}

function NotDuplicatesButton({ group, handlers }: ActionProps): ReactNode {
  return (
    <Button
      label="Not duplicates"
      variant="text"
      disabled={handlers.disabled}
      onPress={() => {
        handlers.onNotDuplicates(group.sha256);
      }}
    />
  );
}

function WideGroup({ group, labels, handlers }: GroupProps): ReactNode {
  return (
    <Card>
      <View className="flex-row items-center gap-4">
        <View className="min-w-0 flex-1 flex-row flex-wrap gap-4">
          {copiesOf(group).map((item) => (
            <WideCopy
              key={item.id}
              item={item}
              keeper={item.id === group.keeperItemId}
              labels={labels}
            />
          ))}
        </View>
        <View className="items-end gap-2">
          <Text variant="footnote" tone="variant" className="tabular-nums">
            {`Saves ${bytes(group.reclaimableBytes)}`}
          </Text>
          <KeepBestButton group={group} handlers={handlers} />
          <NotDuplicatesButton group={group} handlers={handlers} />
        </View>
      </View>
    </Card>
  );
}

function PhoneGroup({ group, labels, handlers }: GroupProps): ReactNode {
  const sources = groupSourcesOf(group, labels);
  return (
    <Card>
      <View className="h-27.5 flex-row gap-2">
        {copiesOf(group).map((item) => (
          <View
            key={item.id}
            accessible
            accessibilityLabel={copyLabelOf(item, item.id === group.keeperItemId, labels)}
            className="min-w-0 flex-1"
          >
            <Thumb item={item} keeper={item.id === group.keeperItemId} />
          </View>
        ))}
      </View>
      <View className="flex-row flex-wrap items-center justify-end gap-2">
        <View className="min-w-40 flex-1">
          <Text variant="caption" tone="variant" className="tabular-nums" numberOfLines={1}>
            {groupLineOf(group)}
          </Text>
          {sources === null ? null : (
            <Text variant="caption" tone="variant" numberOfLines={1}>
              {sources}
            </Text>
          )}
        </View>
        <NotDuplicatesButton group={group} handlers={handlers} />
        <KeepBestButton group={group} handlers={handlers} />
      </View>
    </Card>
  );
}

export function DuplicateGroupCard({
  compact,
  ...props
}: GroupProps & { readonly compact: boolean }): ReactNode {
  return compact ? <PhoneGroup {...props} /> : <WideGroup {...props} />;
}
