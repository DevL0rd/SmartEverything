import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { skipToken } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Icon } from '../../../components/icon';
import { cn } from '../../../design/cn';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { driveLinks, useRouteGeneration, type ResolvedDriveLink } from '../../drive';
import { coverKey, coverStaleMs } from './cover-link';

export function useCoverUrl(itemId: string | null): string | null {
  const generation = useRouteGeneration();
  const query = useScreenQuery({
    queryKey: coverKey(itemId, generation),
    queryFn:
      itemId === null
        ? skipToken
        : // eslint-disable-next-line local/query-fn-signal -- one batched link request serves every cover, so one cover cannot abort it
          (): Promise<ResolvedDriveLink | null> => driveLinks.resolveLatest(itemId, 'thumb'),
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
