import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { appPlatform, isNative } from '../../../design/platform';
import { SettingsFrame } from '../../../settings/settings-frame';
import { SettingsPageBody } from '../../../settings/settings-page';
import { usePhotoBackupState } from '../data';
import { localMediaSource } from '../local/source';
import { PHOTOS_BACKUP_PAGE } from '../settings';
import { AddedCard } from './added-card';
import { FreeUpCard } from './free-up-card';
import { useBackupHandle } from './handle';
import { DevicesCard } from './phones-card';
import { ProcessingCard } from './processing-card';
import { StorageCard } from './storage-card';
import { ThisPhoneCard } from './this-phone-card';

const OPEN_PHOTOS: readonly ShellAction[] = [
  { icon: 'image', label: 'Open Photos', href: href.photos() },
];

function HubCards({ currentDeviceId }: { readonly currentDeviceId: string | null }): ReactNode {
  return (
    <>
      <DevicesCard currentDeviceId={currentDeviceId} />
      <StorageCard />
      <ProcessingCard />
    </>
  );
}

function HubBackup(): ReactNode {
  return (
    <View className="gap-4 large:flex-row large:items-start">
      <View className="min-w-0 gap-4 large:flex-1">
        <DevicesCard currentDeviceId={null} />
        <ProcessingCard />
      </View>
      <View className="min-w-0 gap-4 large:w-96">
        <StorageCard />
      </View>
    </View>
  );
}

function LocalBackup(): ReactNode {
  const handle = useBackupHandle();
  const state = usePhotoBackupState().data;
  const deviceId = handle?.deviceId ?? null;
  const mine = state?.devices.find((entry) => entry.device.deviceId === deviceId);
  return (
    <View className="gap-4 large:flex-row large:items-start">
      <View className="min-w-0 gap-4 large:flex-1">
        <ThisPhoneCard name={mine?.device.name ?? null} />
        <SettingsPageBody page={PHOTOS_BACKUP_PAGE} />
        {appPlatform() === 'android' ? <FreeUpCard /> : null}
      </View>
      <View className="min-w-0 gap-4 large:flex-1">
        <HubCards currentDeviceId={deviceId} />
        <AddedCard compact={isNative()} />
      </View>
    </View>
  );
}

export function BackupSettingsScreen(): ReactNode {
  const local = localMediaSource() !== null;
  return (
    <SettingsFrame page={PHOTOS_BACKUP_PAGE} actions={OPEN_PHOTOS}>
      {local ? <LocalBackup /> : <HubBackup />}
    </SettingsFrame>
  );
}
