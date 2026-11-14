import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { ThisComputerMount } from '../computers/this-computer-mount';
import { useDesktopDrive } from '../computers/this-computer';
import { CacheSettings } from './page-cache';
import { DriveSettingsSection } from './page';

function SyncMountBody(): ReactNode {
  const state = useDesktopDrive()?.state ?? null;
  if (state === null) {
    return (
      <EmptyState
        compact
        icon="folderSync"
        title="Sync and mount start with the computer service"
        body="This desktop has not reported its drive mounts yet. They show here once the computer service is running."
      />
    );
  }
  return (
    <View className="gap-4">
      <ThisComputerMount />
      <CacheSettings cache={state.cache} parent={state.firstRun.defaultParent} />
    </View>
  );
}

export function SyncMountSection(): ReactNode {
  return (
    <DriveSettingsSection section="sync-mount">
      <SyncMountBody />
    </DriveSettingsSection>
  );
}
