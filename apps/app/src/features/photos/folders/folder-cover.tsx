import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { skipToken } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Icon } from '../../../components/icon';
import { cn } from '../../../design/cn';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { localPhotoThumbnail } from '../library/local-thumbnail';
import { Cover } from '../places/cover';
import type { FolderCover as FolderCoverValue } from './model';

function useLocalCover(localId: string | null): string | null {
  const query = useScreenQuery({
    queryKey: ['window', 'photos-folder-cover', localId],
    queryFn:
      // eslint-disable-next-line local/query-fn-signal -- the thumbnail is read from the device library, which cannot be aborted
      localId === null ? skipToken : (): Promise<string | null> => localPhotoThumbnail(localId),
    retry: false,
  });
  return query.data ?? null;
}

function LocalCover({
  localId,
  className,
}: {
  readonly localId: string | null;
  readonly className: string;
}): ReactNode {
  const uri = useLocalCover(localId);
  return (
    <View
      accessible={false}
      className={cn('items-center justify-center overflow-hidden bg-surface-3', className)}
    >
      {uri === null ? (
        <Icon name="folder" size={24} tone="faint" />
      ) : (
        <Image
          source={{ uri }}
          contentFit="cover"
          cachePolicy="memory"
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      )}
    </View>
  );
}

export function FolderCover({
  cover,
  className,
}: {
  readonly cover: FolderCoverValue;
  readonly className: string;
}): ReactNode {
  if (cover?.kind === 'local') {
    return <LocalCover localId={cover.video ? null : cover.localId} className={className} />;
  }
  return <Cover itemId={cover?.itemId ?? null} className={className} />;
}
