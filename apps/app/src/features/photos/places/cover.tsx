import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { skipToken } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Icon } from '../../../components/icon';
import { cn } from '../../../design/cn';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { readRoutedDriveLinks } from '../../drive/data/links';
import { coverLinkOf, coverStaleMs, type CoverLink } from './cover-link';

export function coverKey(itemId: string | null): readonly unknown[] {
  return driveKey('photo-cover', DRIVE_EVERYWHERE, itemId);
}

async function coverLink(itemId: string): Promise<CoverLink | null> {
  return coverLinkOf(await readRoutedDriveLinks([itemId]), itemId);
}

export function useCoverUrl(itemId: string | null): string | null {
  const query = useScreenQuery({
    queryKey: coverKey(itemId),
    queryFn: itemId === null ? skipToken : (): Promise<CoverLink | null> => coverLink(itemId),
    staleTime: (entry) => coverStaleMs(entry.state.data ?? null, Date.now()),
    retry: false,
  });
  return query.data?.url ?? null;
}

export function Cover({
  itemId,
  className,
}: {
  readonly itemId: string | null;
  readonly className?: string;
}): ReactNode {
  const url = useCoverUrl(itemId);
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
          cachePolicy="memory-disk"
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      )}
    </View>
  );
}
