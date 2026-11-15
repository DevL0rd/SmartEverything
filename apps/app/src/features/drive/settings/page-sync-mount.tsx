import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { EmptyState } from '../../../components/empty-state';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useDesktopDrive } from '../computers/this-computer';
import { ThisComputerMount } from '../computers/this-computer-mount';
import { AdvancedSettings } from './page-advanced';
import { CacheSettings } from './page-cache';
import { DriveSettingsSection } from './page';

function SyncMountBody(): ReactNode {
  const drive = useDesktopDrive();
  const state = drive?.state ?? null;
  if (drive === null || state === null) {
    return (
      <EmptyState
        compact
        icon="folderSync"
        title="Waiting for the computer service"
        body="This computer has not reported its drive yet. The cache and mount settings show here once the computer service is running."
      />
    );
  }
  return (
    <View className="gap-4">
      <List inset>
        <ThisComputerMount />
        <NavRow
          title="Computers"
          icon="laptop"
          subtitle="Mounting and synced folders on each computer"
          wrapSubtitle
          href={href.drivePage('computers')}
        />
      </List>
      <CacheSettings cache={state.cache} drive={drive} />
      <AdvancedSettings state={state} />
    </View>
  );
}

export function SyncMountSection(): ReactNode {
  return (
    <DriveSettingsSection>
      <SyncMountBody />
    </DriveSettingsSection>
  );
}
