import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Logger } from '@smarteverything/logging';
import { PHOTOS_BACKUP_SETTINGS_HREF } from '../components/photos-frame';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { PageShell } from '../../../components/page-shell/page-shell';
import { Text } from '../../../components/text';
import { Zoomable } from '../../../components/zoomable';
import { cn } from '../../../design/cn';
import { useIsPhone } from '../../../design/size-class';
import { ThemeScope } from '../../../design/theme-scope';
import { duration } from '../../../format/time';
import { useLocalLibrary } from '../local/use-local-library';
import { resolveLocalMedia } from '../local/source';
import type { LocalMediaItem } from '../local/types';
import { useLocalBackupEntries } from '../local/tiles';
import { closeViewer } from './close';
import { takenLine, wallTimeOf, megapixels } from './info-model';
import { LocalPlayback } from './local-playback';
import { MediaSkeleton } from './media-skeleton';

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

function Centre({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <View className="min-h-0 flex-1 items-center justify-center p-6 pt-safe-offset-14">
      {children}
    </View>
  );
}

function Stage({
  phone,
  children,
}: {
  readonly phone: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className={cn('min-h-0 flex-1 justify-center', phone ? '' : 'pt-safe-offset-14')}>
      {children}
    </View>
  );
}

function LocalMedia({ item }: { readonly item: LocalMediaItem }): ReactNode {
  const { uri, failed } = useLocalUri(item.id);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const phone = useIsPhone();
  if (failed || decodeFailed)
    return (
      <Centre>
        <EmptyState
          icon="image"
          title="This file is unavailable"
          body="It may have been moved or access to it was removed."
        />
      </Centre>
    );
  if (uri === null) {
    return (
      <Centre>
        <MediaSkeleton />
      </Centre>
    );
  }
  if (item.video) {
    return (
      <Stage phone={phone}>
        <LocalPlayback uri={uri} durationMs={item.durationMs} phone={phone} />
      </Stage>
    );
  }
  return (
    <Stage phone={phone}>
      <LocalPicture item={item} uri={uri} onFailed={setDecodeFailed} />
    </Stage>
  );
}

function LocalPicture({
  item,
  uri,
  onFailed,
}: {
  readonly item: LocalMediaItem;
  readonly uri: string;
  readonly onFailed: (failed: boolean) => void;
}): ReactNode {
  return (
    <Zoomable wheel="wheel" className="min-h-0 flex-1">
      <Image
        source={{ uri, cacheKey: `${item.id}:${String(item.modificationTime)}` }}
        contentFit="contain"
        accessibilityLabel={item.name}
        onError={(event) => {
          log.warn('viewer.local_image_failed', { reason: event.error });
          onFailed(true);
        }}
        style={StyleSheet.absoluteFill}
      />
    </Zoomable>
  );
}

export function localTakenLine(item: LocalMediaItem, backedUp: boolean): string {
  const taken = takenLine(wallTimeOf(new Date(item.takenAt).toISOString(), null));
  return ['On this device', ...(backedUp ? ['Backed up'] : []), taken].join(' · ');
}

export function localDetail(item: LocalMediaItem): string | null {
  const parts = [
    ...(item.width === null || item.height === null
      ? []
      : [`${String(item.width)} × ${String(item.height)}`, megapixels(item.width, item.height)]),
    ...(item.durationMs === null ? [] : [duration(item.durationMs / 1000)]),
  ];
  return parts.length === 0 ? null : parts.join(' · ');
}

function LocalDetails({ item }: { readonly item: LocalMediaItem }): ReactNode {
  const entries = useLocalBackupEntries();
  const backedUp = entries.some((entry) => entry.localId === item.id && entry.uploadedAt !== null);
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-3 px-gutter py-3 pb-safe-offset-3">
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="caption" tone="variant">
          {localTakenLine(item, backedUp)}
        </Text>
        {localDetail(item) === null ? null : (
          <Text variant="caption" tone="variant" className="tabular-nums">
            {localDetail(item)}
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
        <PageShell variant="overlay" title={item?.name ?? 'Local media'} onBack={closeViewer}>
          {item === undefined ? (
            <Centre>
              {library.state === 'loading' ? (
                <MediaSkeleton />
              ) : (
                <EmptyState
                  icon="image"
                  title="This file is unavailable"
                  body="Open it again from your Photos library."
                />
              )}
            </Centre>
          ) : (
            <>
              <LocalMedia key={`${item.id}:${String(item.modificationTime)}`} item={item} />
              <LocalDetails item={item} />
            </>
          )}
        </PageShell>
      </View>
    </ThemeScope>
  );
}
