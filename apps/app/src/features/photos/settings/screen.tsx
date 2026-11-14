import { Children, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import type { HeaderAction } from '../../../components/page-header';
import { Text } from '../../../components/text';
import { isNative } from '../../../design/platform';
import { SettingsFrame } from '../../../settings/settings-frame';
import { SettingsPageBody } from '../../../settings/settings-page';
import { useSyncStatus } from '../../../store/selectors';
import { usePhotoRailCounts } from '../data/queries';
import { localMediaSource } from '../local/source';
import { PHOTOS_PAGE } from '../settings';
import { BackupLinkCard, DuplicatesLinkCard } from './link-cards';
import { offlineText, summaryText } from './model';

const OPEN_PHOTOS: readonly HeaderAction[] = [
  { icon: 'image', label: 'Open Photos', href: href.photos() },
];

function PhotosSettingsBlocks({ children }: { readonly children: ReactNode }): ReactNode {
  if (isNative()) return children;
  return (
    <View className="gap-section-gap web:block web:columns-(--spacing-picker)">
      {Children.map(children, (block) => (
        <View className="min-w-0 max-w-reading web:break-inside-avoid web:not-last:pb-section-gap">
          {block}
        </View>
      ))}
    </View>
  );
}

function LibrarySummary(): ReactNode {
  const counts = usePhotoRailCounts().data;
  const text = summaryText(counts?.library ?? null, counts?.backupDevices ?? null);
  if (text === null) return null;
  return (
    <Text variant="footnote" tone="variant" className="tabular px-4">
      {text}
    </Text>
  );
}

function LinkCards(): ReactNode {
  return (
    <View className="gap-3 large:flex-row large:items-stretch">
      <BackupLinkCard />
      <DuplicatesLinkCard />
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
      contentWidth={isNative() ? 'reading' : 'full'}
      {...(live ? {} : { banner: <OfflineBanner /> })}
    >
      <View className="gap-section-gap">
        <LinkCards />
        <LibrarySummary />
        <SettingsPageBody page={PHOTOS_PAGE} BlocksLayout={PhotosSettingsBlocks} />
      </View>
    </SettingsFrame>
  );
}
