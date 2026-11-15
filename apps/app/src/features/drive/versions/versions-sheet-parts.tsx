import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Text } from '../../../components/text';
import { useSyncStatus } from '../../../store/selectors';
import type { useDriveVersions } from '../data';
import type { CompareNames } from './diff-model';
import type { VersionLink } from './version-compare';
import type { TimelineLook } from './version-timeline';
import { captionOf, totalOf, totalText, type VersionEntry } from './versions-model';

type VersionPages = ReturnType<typeof useDriveVersions>;

interface TitleData {
  readonly item: DriveItem;
  readonly entries: readonly VersionEntry[];
  readonly settled: boolean;
}

export interface ComparedPair {
  readonly a: VersionEntry;
  readonly b: VersionEntry;
  readonly names: CompareNames;
  readonly link: VersionLink;
}

export function PickCaptions({
  pair,
  look,
}: {
  readonly pair: ComparedPair;
  readonly look: TimelineLook;
}): ReactNode {
  const { a, b, names } = pair;
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {`${names.a} · ${captionOf(a, look.namers, look.time)}`}
      </Text>
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {`${names.b} · ${captionOf(b, look.namers, look.time)}`}
      </Text>
    </View>
  );
}

export function Unloaded({
  pages,
  loading,
}: {
  readonly pages: VersionPages;
  readonly loading: ReactNode;
}): ReactNode {
  const live = useSyncStatus().status === 'live';
  if (!live) {
    return (
      <EmptyState
        compact
        icon="wifiOff"
        title="The hub is offline"
        body="Versions come back when the hub reconnects. Nothing is lost while it is away."
      />
    );
  }
  if (pages.isError) {
    return (
      <ErrorState
        error={pages.error}
        retry={() => {
          background(pages.refetch(), 'drive_versions.refetch_failed');
        }}
      />
    );
  }
  return loading;
}

export function SheetTitle({
  data,
  large,
}: {
  readonly data: TitleData;
  readonly large: boolean;
}): ReactNode {
  const variant = large ? 'callout' : 'footnote';
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text variant={large ? 'large-title' : 'title-3'} role="heading" numberOfLines={1}>
        Versions
      </Text>
      <View className="min-w-0 flex-row items-baseline">
        <Text variant={variant} tone="variant" ellipsize="middle" className="min-w-0 shrink">
          {data.item.name}
        </Text>
        {data.settled ? (
          <Text variant={variant} tone="variant" numberOfLines={1} className="tabular shrink-0">
            {`\u00a0· ${totalText(totalOf(data.entries))}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function TouchFooter({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" className="px-4 py-4">
      {text}
    </Text>
  );
}
