import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Skeleton } from '../../../components/skeleton';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { DRIVE_PAGE } from '../../../settings/tree-drive';
import { COMPACT_CARD } from './version-timeline';

const SKELETON_ROWS = ['a', 'b', 'c', 'd'] as const;

export function TimelineLoading(): ReactNode {
  return (
    <View aria-label="Loading versions" className="gap-2 p-3">
      {SKELETON_ROWS.map((key) => (
        <View key={key} className="h-row-h-2 flex-row items-center gap-3">
          <Skeleton shape="circle" className="size-6 rounded-xs" />
          <View className="flex-1 gap-2">
            <Skeleton shape="text" className="w-32" />
            <Skeleton shape="text" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function CompactTimelineLoading(): ReactNode {
  return (
    <View aria-label="Loading versions" className={COMPACT_CARD}>
      {SKELETON_ROWS.map((key, index) => (
        <View
          key={key}
          className={cn(
            'h-row-h-2 flex-row items-center gap-3',
            index > 0 && 'border-t border-outline-variant',
          )}
        >
          <View className="min-w-0 flex-1 gap-2">
            <Skeleton shape="text" className="w-32" />
            <View className="flex-row items-center gap-2">
              <Skeleton shape="circle" className="size-2" />
              <Skeleton shape="text" className="min-w-0 flex-1" />
            </View>
          </View>
          <Skeleton shape="text" className="w-12" />
        </View>
      ))}
    </View>
  );
}

function VersionsSettingsButton(): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <Button
      label="Open Drive settings"
      icon="settings"
      variant="tonal"
      size={pointer ? 'md' : 'lg'}
      href={href.settings.focus(DRIVE_PAGE.drives, 'drive.drives.versions')}
    />
  );
}

const ONE_VERSION_BODY = 'When this file changes, the old copy is kept here for a year.';

export function OneVersion({ kept }: { readonly kept: boolean | null }): ReactNode {
  if (kept === null) {
    return (
      <EmptyState
        compact
        icon="layers"
        title="One version so far"
        body="Earlier copies show here when this file changes and its drive keeps versions."
      />
    );
  }
  return kept ? (
    <EmptyState compact icon="layers" title="One version so far" body={ONE_VERSION_BODY} />
  ) : (
    <EmptyState
      compact
      icon="layers"
      title="Versions are off"
      body="Earlier copies of files in this drive are not kept. Versions in Drive settings keeps them, and they use space."
      action={<VersionsSettingsButton />}
    />
  );
}
