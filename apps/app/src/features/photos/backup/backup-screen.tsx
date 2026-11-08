import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { appPlatform } from '../../../design/platform';
import { useSyncStatus } from '../../../store/selectors';
import { PhotosFrame } from '../components/photos-frame';
import { usePhotoBackupState } from '../data';
import { AddedCard } from './added-card';
import { FreeUpCard } from './free-up-card';
import { useBackupHandle } from './handle';
import { useLiveProgress } from './live';
import { backupSubtitleOf, type LiveProgress } from './phones-model';
import { PhonesCard } from './phones-card';
import { ProcessingCard } from './processing-card';
import { StorageCard } from './storage-card';
import { ThisPhoneCard } from './this-phone-card';

const OFFLINE_HUB = 'Backup state comes back when your home hub answers.';

const OFFLINE_PHONE = 'Backup on this device keeps going and catches up when the hub is back.';

function PhonesFreeUpNote(): ReactNode {
  return (
    <Card title="Free up space on phones">
      <Text variant="footnote" tone="variant">
        Each phone can remove what the hub already has and has checked. Open Photos on the phone to
        do it.
      </Text>
    </Card>
  );
}

function HubBackup({ live }: { readonly live: LiveProgress }): ReactNode {
  return (
    <View className="gap-4 large:flex-row large:items-start">
      <View className="min-w-0 gap-4 large:flex-1">
        <PhonesCard live={live} except={null} />
        <AddedCard compact={false} />
        <ProcessingCard live={live} />
      </View>
      <View className="min-w-0 gap-4 large:w-96">
        <StorageCard />
        <PhonesFreeUpNote />
      </View>
    </View>
  );
}

function PhoneBackup({ live }: { readonly live: LiveProgress }): ReactNode {
  const handle = useBackupHandle();
  const states = usePhotoBackupState().data;
  const deviceId = handle?.deviceId ?? null;
  const mine = states?.find((state) => state.device.deviceId === deviceId);
  return (
    <View className="gap-3">
      <ThisPhoneCard name={mine?.device.name ?? null} />
      {appPlatform() === 'android' ? <FreeUpCard /> : <StorageCard />}
      <PhonesCard live={live} except={deviceId} />
      <AddedCard compact />
    </View>
  );
}

export function BackupScreen(): ReactNode {
  const live = useLiveProgress();
  const states = usePhotoBackupState().data;
  const connected = useSyncStatus().status === 'live';
  const phone = appPlatform() !== 'web';
  return (
    <PhotosFrame
      active="backup"
      subtitle={backupSubtitleOf(states, live)}
      banner={
        connected ? null : (
          <Banner
            tone="info"
            title="Offline · showing the last snapshot"
            body={phone ? OFFLINE_PHONE : OFFLINE_HUB}
            wrapBody
          />
        )
      }
    >
      {phone ? <PhoneBackup live={live} /> : <HubBackup live={live} />}
    </PhotosFrame>
  );
}
