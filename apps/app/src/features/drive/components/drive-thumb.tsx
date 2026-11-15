import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { DriveItem } from '@smarteverything/domain';
import { cn } from '../../../design/cn';
import { useDriveLink } from '../data';
import { thumbReadyOf } from '../model/item-content';

export function DriveThumb({
  item,
  className,
}: {
  readonly item: DriveItem;
  readonly className: string;
}): ReactNode {
  const url = useDriveLink(thumbReadyOf(item) ? item.id : null, item.rev, 'thumb');
  return (
    <View className={cn('overflow-hidden bg-surface-3', className)}>
      {url === null ? null : (
        <Image
          source={{ uri: url }}
          recyclingKey={`${item.id}:${String(item.rev)}`}
          contentFit="cover"
          accessibilityLabel={item.name}
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}
