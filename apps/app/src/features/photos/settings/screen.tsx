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
import { offlineText, summaryText } from './model';

export const PHOTOS_SETTINGS_PAGE = 'photos';

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
  const text = summaryText(counts?.timeline ?? null, counts?.backupPhones ?? null);
  if (text === null) return null;
  return (
    <Text variant="footnote" tone="variant" className="tabular px-4">
      {text}
    </Text>
  );
}

function OfflineBanner(): ReactNode {
  return (
    <Banner
      tone="info"
      title="Offline · showing the last snapshot"
      body={offlineText(isNative())}
      wrapBody
    />
  );
}

export function PhotosSettingsScreen(): ReactNode {
  const live = useSyncStatus().status === 'live';
  return (
    <SettingsFrame
      page={PHOTOS_SETTINGS_PAGE}
      actions={OPEN_PHOTOS}
      contentWidth={isNative() ? 'reading' : 'full'}
      {...(live ? {} : { banner: <OfflineBanner /> })}
    >
      <LibrarySummary />
      <SettingsPageBody page={PHOTOS_SETTINGS_PAGE} BlocksLayout={PhotosSettingsBlocks} />
    </SettingsFrame>
  );
}
