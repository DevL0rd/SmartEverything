import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import type { HeaderAction } from '../../../components/page-header';
import { appPlatform, isNative } from '../../../design/platform';
import { SettingsFrame } from '../../../settings/settings-frame';
import { SettingsPageBody } from '../../../settings/settings-page';
import { useSyncStatus } from '../../../store/selectors';
import { usePhotoBackupState } from '../data';
import { localMediaSource } from '../local/source';
import { PHOTOS_BACKUP_PAGE } from '../settings';
import { AddedCard } from './added-card';
import { FreeUpCard } from './free-up-card';
import { useBackupHandle } from './handle';
import { useLiveProgress } from './live';
import { DevicesCard } from './phones-card';
import type { LiveProgress } from './phones-model';
import { ProcessingCard } from './processing-card';
import { StorageCard } from './storage-card';
import { ThisPhoneCard } from './this-phone-card';

const OPEN_PHOTOS: readonly HeaderAction[] = [
  { icon: 'image', label: 'Open Photos', href: href.photos() },
];

const OFFLINE_HUB = 'Backup state comes back when your home hub answers.';

const OFFLINE_LOCAL = 'Backup on this device keeps going and catches up when the hub is back.';

function HubCards({
  live,
  currentDeviceId,
}: {
  readonly live: LiveProgress;
  readonly currentDeviceId: string | null;
}): ReactNode {
  return (
    <>
      <DevicesCard live={live} currentDeviceId={currentDeviceId} />
      <StorageCard />
      <ProcessingCard live={live} />
    </>
  );
}

function HubBackup({ live }: { readonly live: LiveProgress }): ReactNode {
  return (
    <View className="gap-4 large:flex-row large:items-start">
      <View className="min-w-0 gap-4 large:flex-1">
        <DevicesCard live={live} currentDeviceId={null} />
        <ProcessingCard live={live} />
      </View>
      <View className="min-w-0 gap-4 large:w-96">
        <StorageCard />
      </View>
    </View>
  );
}

function LocalBackup({ live }: { readonly live: LiveProgress }): ReactNode {
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
        <HubCards live={live} currentDeviceId={deviceId} />
        <AddedCard compact={isNative()} />
      </View>
    </View>
  );
}

export function BackupSettingsScreen(): ReactNode {
  const live = useLiveProgress();
  const connected = useSyncStatus().status === 'live';
  const local = localMediaSource() !== null;
  return (
    <SettingsFrame
      page={PHOTOS_BACKUP_PAGE}
      actions={OPEN_PHOTOS}
      contentWidth={isNative() ? 'reading' : 'full'}
      {...(connected
        ? {}
        : {
            banner: (
              <Banner
                tone="info"
                title="Offline · showing the last snapshot"
                body={local ? OFFLINE_LOCAL : OFFLINE_HUB}
                wrapBody
              />
            ),
          })}
    >
      {local ? <LocalBackup live={live} /> : <HubBackup live={live} />}
    </SettingsFrame>
  );
}
