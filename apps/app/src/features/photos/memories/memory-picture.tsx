import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { cn } from '../../../design/cn';
import { useMotion } from '../../../design/motion';
import { useDriveLink, type DriveLinkSize } from '../../nas/data';
import type { MemoryMedia } from './items';

const FADE_MS = 120;

export function MemoryPicture({
  item,
  size,
  className,
  stage = false,
}: {
  readonly item: MemoryMedia | null;
  readonly size: Exclude<DriveLinkSize, 'file'>;
  readonly className?: string;
  readonly stage?: boolean;
}): ReactNode {
  const motion = useMotion();
  const url = useDriveLink(item?.id ?? null, item?.rev ?? 1, size);
  return (
    <View className={cn('overflow-hidden', stage ? 'bg-black' : 'bg-surface-3', className)}>
      {url === null || item === null ? null : (
        <Image
          source={{ uri: url, cacheKey: `${item.id}:${String(item.rev)}:${size}` }}
          contentFit="cover"
          recyclingKey={`${item.id}:${String(item.rev)}`}
          cachePolicy="disk"
          transition={motion.reduced ? 0 : FADE_MS}
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      )}
    </View>
  );
}
