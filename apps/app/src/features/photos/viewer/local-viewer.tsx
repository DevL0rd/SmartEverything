import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Logger } from '@smarteverything/logging';
import { PHOTOS_BACKUP_SETTINGS_HREF } from '../components/photos-frame';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { Zoomable } from '../../../components/zoomable';
import { ThemeScope } from '../../../design/theme-scope';
import { useLocalLibrary } from '../local/use-local-library';
import { resolveLocalMedia } from '../local/source';
import type { LocalMediaItem } from '../local/types';
import { useLocalBackupEntries } from '../local/tiles';
import { closeViewer } from './close';
import { LocalPlayback } from './local-playback';

const log = new Logger('app.photos');

function useLocalUri(id: string): { readonly uri: string | null; readonly failed: boolean } {
  const [state, setState] = useState<{ readonly uri: string | null; readonly failed: boolean }>({
    uri: null,
    failed: false,
  });
  useEffect(() => {
    let current = true;
    resolveLocalMedia(id)
      .then((uri) => {
        if (current) setState({ uri, failed: uri === null });
      })
      .catch((error: unknown) => {
        log.error('viewer.local_failed', error);
        if (current) setState({ uri: null, failed: true });
      });
    return (): void => {
      current = false;
    };
  }, [id]);
  return state;
}

function LocalMedia({ item }: { readonly item: LocalMediaItem }): ReactNode {
  const { uri, failed } = useLocalUri(item.id);
  const [decodeFailed, setDecodeFailed] = useState(false);
  if (failed || decodeFailed)
    return (
      <EmptyState
        icon="image"
        title="This file is unavailable"
        body="It may have been moved or access to it was removed."
      />
    );
  if (uri === null) return <Text>Loading…</Text>;
  if (item.video) return <LocalPlayback uri={uri} />;
  return (
    <Zoomable className="min-h-0 flex-1">
      <Image
        source={{ uri, cacheKey: `${item.id}:${String(item.modificationTime)}` }}
        contentFit="contain"
        accessibilityLabel={item.name}
        onError={(event) => {
          log.warn('viewer.local_image_failed', { reason: event.error });
          setDecodeFailed(true);
        }}
        style={StyleSheet.absoluteFill}
      />
    </Zoomable>
  );
}

function LocalDetails({ item }: { readonly item: LocalMediaItem }): ReactNode {
  const entries = useLocalBackupEntries();
  const backedUp = entries.some((entry) => entry.localId === item.id && entry.uploadedAt !== null);
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-3 px-gutter py-3 pb-safe-offset-3">
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="caption" tone="variant">
          On this device{backedUp ? ' · Backed up' : ''} · {new Date(item.takenAt).toLocaleString()}
        </Text>
        {item.width === null || item.height === null ? null : (
          <Text variant="caption" tone="variant">
            {item.width} × {item.height}
          </Text>
        )}
        {item.durationMs === null ? null : (
          <Text variant="caption" tone="variant">
            {Math.round(item.durationMs / 1000)} seconds
          </Text>
        )}
      </View>
      {backedUp ? null : (
        <Button label="Back up" icon="upload" variant="tonal" href={PHOTOS_BACKUP_SETTINGS_HREF} />
      )}
    </View>
  );
}

export function LocalViewer({ id }: { readonly id: string }): ReactNode {
  const library = useLocalLibrary();
  const item = library.items.find((entry) => entry.id === id);
  return (
    <ThemeScope theme="dark">
      <View className="min-h-0 flex-1 bg-black">
        <View className="min-h-16 flex-row items-center gap-2 px-4 pt-safe">
          <IconButton icon="arrowLeft" label="Close viewer" onPress={closeViewer} shortcut="Esc" />
          <Text variant="label" className="min-w-0 flex-1">
            {item?.name ?? 'Local media'}
          </Text>
        </View>
        {item === undefined ? (
          <EmptyState
            icon="image"
            title={
              library.state === 'loading' ? 'Loading local media…' : 'This file is unavailable'
            }
            body="Open it again from your Photos library."
          />
        ) : (
          <>
            <LocalMedia key={`${item.id}:${String(item.modificationTime)}`} item={item} />
            <LocalDetails item={item} />
          </>
        )}
      </View>
    </ThemeScope>
  );
}
