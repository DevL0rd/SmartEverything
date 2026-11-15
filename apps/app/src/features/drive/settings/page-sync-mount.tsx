import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DesktopDriveFuse } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { EmptyState } from '../../../components/empty-state';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { SetupAction } from '../computers/mount-panel';
import { useDesktopDrive } from '../computers/this-computer';
import { ThisComputerMount } from '../computers/this-computer-mount';
import { CacheSettings } from './page-cache';
import { DriveSettingsSection } from './page';
import { DRIVE_PAGE } from '../../../settings/tree-drive';

function FuseMissing({ fuse }: { readonly fuse: DesktopDriveFuse }): ReactNode {
  if (fuse.available) return null;
  return (
    <Banner tone="warning" title="FUSE is missing on this computer" body={fuse.reason} wrapBody>
      <SetupAction setup="fuse3" command={fuse.command} />
    </Banner>
  );
}

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
      <FuseMissing fuse={state.fuse} />
      <List inset>
        <ThisComputerMount state={state} />
        <NavRow
          title="Computers"
          icon="laptop"
          subtitle="Mounting and synced folders on each computer"
          wrapSubtitle
          href={href.drivePage('computers')}
        />
        <NavRow
          title="Advanced mount settings"
          icon="customize"
          subtitle="Kernel, cache, upload and connection tuning"
          wrapSubtitle
          href={href.settings.page(DRIVE_PAGE.advanced)}
        />
      </List>
      <CacheSettings cache={state.cache} drive={drive} />
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
