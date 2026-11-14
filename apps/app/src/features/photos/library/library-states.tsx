import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Skeleton } from '../../../components/skeleton';
import { clock } from '../../../format/time';
import { PHOTOS_BACKUP_SETTINGS_HREF } from '../components/photos-frame';
import { offlineBody } from './library-model';
import { TAB_EMPTY, type HubTabId } from './library-tabs-view';

const ROWS: readonly (readonly string[])[] = [
  ['flex-3', 'flex-2', 'flex-3', 'flex-2'],
  ['flex-2', 'flex-3', 'flex-2'],
  ['flex-2', 'flex-2', 'flex-3'],
];

function SkeletonRow({ flexes }: { readonly flexes: readonly string[] }): ReactNode {
  return (
    <View className="flex-row gap-0.75">
      {flexes.map((flex, index) => (
        <View key={index} className={flex}>
          <Skeleton shape="block" className="h-40 rounded-xs" />
        </View>
      ))}
    </View>
  );
}

export function LibraryLoading(): ReactNode {
  return (
    <View accessibilityLabel="Loading photos" className="gap-0.75 pt-4">
      <Skeleton shape="line" className="mb-2 h-5 w-48" />
      {ROWS.map((flexes, index) => (
        <SkeletonRow key={index} flexes={flexes} />
      ))}
    </View>
  );
}

function AllActions({ onUpload }: { readonly onUpload: () => void }): ReactNode {
  return (
    <View className="flex-row flex-wrap justify-center gap-2">
      <Button label="Upload photos" icon="upload" variant="tonal" onPress={onUpload} />
      <Button
        label="Set up backup"
        icon="smartphone"
        variant="outlined"
        href={PHOTOS_BACKUP_SETTINGS_HREF}
      />
    </View>
  );
}

export function LibraryEmpty({
  tab,
  onUpload,
}: {
  readonly tab: HubTabId;
  readonly onUpload: () => void;
}): ReactNode {
  const copy = TAB_EMPTY[tab];
  return (
    <View className="items-center pt-6">
      <EmptyState
        icon={copy.icon}
        title={copy.title}
        body={copy.body}
        {...(tab === 'all' ? { action: <AllActions onUpload={onUpload} /> } : {})}
      />
    </View>
  );
}

export function LibraryError({ onRetry }: { readonly onRetry: () => void }): ReactNode {
  return (
    <View className="pt-4">
      <Banner
        tone="critical"
        title="The library did not load"
        body="The hub did not answer. Local photos and videos remain available. Your backed-up library appears when the hub is back."
        wrapBody
        action={{ label: 'Try again', onPress: onRetry }}
      />
    </View>
  );
}

export function OfflineBanner({ seenAt }: { readonly seenAt: number | null }): ReactNode {
  return (
    <Banner
      tone="warning"
      title="The hub is offline"
      body={offlineBody(seenAt === null ? null : clock(seenAt))}
      wrapBody
    />
  );
}
