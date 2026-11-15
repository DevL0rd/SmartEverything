import { Children, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { Text } from '../../../components/text';
import { isNative } from '../../../design/platform';
import { SettingsFrame } from '../../../settings/settings-frame';
import { SettingsPageBody } from '../../../settings/settings-page';
import { useSyncStatus } from '../../../store/selectors';
import { usePhotoBackupState, usePhotoRailCounts } from '../data/queries';
import { localMediaSource } from '../local/source';
import { PHOTOS_PAGE } from '../settings';
import { SmartLinkCard } from '../smart/link-card';
import { BackupLinkCard, DuplicatesLinkCard } from './link-cards';
import { backingUpOf, offlineText, summaryText } from './model';

const OPEN_PHOTOS: readonly ShellAction[] = [
  { icon: 'image', label: 'Open Photos', href: href.photos() },
];

function PhotosSettingsBlocks({ children }: { readonly children: ReactNode }): ReactNode {
  if (isNative()) return children;
  return (
    <View className="gap-section-gap web:block web:columns-(--spacing-picker)">
      {Children.map(children, (block) => (
        <View className="min-w-0 web:break-inside-avoid web:not-last:pb-section-gap">{block}</View>
      ))}
    </View>
  );
}

function LibrarySummary(): ReactNode {
  const counts = usePhotoRailCounts().data;
  const state = usePhotoBackupState().data;
  const text = summaryText(
    counts?.library ?? null,
    state === undefined ? null : backingUpOf(state),
  );
  if (text === null) return null;
  return (
    <Text variant="footnote" tone="variant" className="tabular px-4">
      {text}
    </Text>
  );
}

function LinkCards(): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-3">
      <View className="min-w-64 flex-1">
        <BackupLinkCard />
      </View>
      <View className="min-w-64 flex-1">
        <DuplicatesLinkCard />
      </View>
      <View className="min-w-64 flex-1">
        <SmartLinkCard />
      </View>
    </View>
  );
}

function OfflineBanner(): ReactNode {
  return (
    <Banner
      tone="info"
      title="Offline · showing the last snapshot"
      body={offlineText(localMediaSource() !== null)}
      wrapBody
    />
  );
}

export function PhotosSettingsScreen(): ReactNode {
  const live = useSyncStatus().status === 'live';
  return (
    <SettingsFrame
      page={PHOTOS_PAGE}
      actions={OPEN_PHOTOS}
      {...(live ? {} : { banner: <OfflineBanner /> })}
    >
      <View className="gap-section-gap">
        <LinkCards />
        <LibrarySummary />
        <SettingsPageBody page={PHOTOS_PAGE} BlocksLayout={PhotosSettingsBlocks} locked={!live} />
      </View>
    </SettingsFrame>
  );
}
