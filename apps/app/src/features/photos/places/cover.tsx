import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { skipToken } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { readDriveLinks } from '../../../api/drive';
import { Icon } from '../../../components/icon';
import { cn } from '../../../design/cn';
import { useMotion } from '../../../design/motion';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';

const COVER_FADE_MS = 120;

export function coverKey(itemId: string | null): readonly unknown[] {
  return driveKey('photo-cover', DRIVE_EVERYWHERE, itemId);
}

async function coverUrl(itemId: string): Promise<string | null> {
  const links = await readDriveLinks([itemId]);
  const link = links.find((entry) => entry.itemId === itemId);
  return link?.thumb?.url ?? null;
}

export function useCoverUrl(itemId: string | null): string | null {
  const query = useScreenQuery({
    queryKey: coverKey(itemId),
    queryFn: itemId === null ? skipToken : (): Promise<string | null> => coverUrl(itemId),
    retry: false,
  });
  return query.data ?? null;
}

export function Cover({
  itemId,
  className,
}: {
  readonly itemId: string | null;
  readonly className?: string;
}): ReactNode {
  const url = useCoverUrl(itemId);
  const motion = useMotion();
  return (
    <View
      accessible={false}
      className={cn(
        'items-center justify-center overflow-hidden rounded-xs bg-surface-3',
        className,
      )}
    >
      {url === null ? (
        <Icon name="image" size={20} tone="faint" />
      ) : (
        <Image
          source={{ uri: url }}
          contentFit="cover"
          cachePolicy="disk"
          transition={motion.reduced ? 0 : COVER_FADE_MS}
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      )}
    </View>
  );
}
