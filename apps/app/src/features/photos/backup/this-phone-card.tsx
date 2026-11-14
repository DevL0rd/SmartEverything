import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { href, UPDATES_SETTINGS_PAGE } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Arc } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { Text } from '../../../components/text';
import { percent } from '../../../format/number';
import { useEntityStore } from '../../../store/store-context';
import { changeBackupEnabled } from './activation';
import { PREFS, usePref } from '../../../store/prefs';
import { phoneLeftOf } from '../components/photos-frame';
import { useBackupStatus, type BackupStatus } from './model/status';
import { backupAccessPort } from './runner/platform-adapters';
import { appPlatform } from '../../../design/platform';
import { useBackupHandle, type BackupHandle } from './handle';
import { conditionChipsOf, phoneChipOf, phoneProgressOf } from './phones-model';
import { thisPhoneCopy } from './this-phone-model';

const RING = 88;

function UpdateTheApp(): ReactNode {
  return (
    <EmptyState
      icon="download"
      title="Update the app to turn on backup"
      body="Install the current app to back up this device’s local photos and videos."
      action={
        <Button
          label="Open Updates"
          variant="tonal"
          href={href.settings.page(UPDATES_SETTINGS_PAGE)}
        />
      }
    />
  );
}

function TurnOn(): ReactNode {
  const store = useEntityStore();
  const pref = usePref(PREFS.photosBackup);
  return (
    <EmptyState
      icon="upload"
      title="Backup is off on this device"
      body="Turn it on to keep this device’s photos and videos on the hub as originals. Local originals stay on this device."
      action={
        <Button
          label="Turn on backup"
          variant="filled"
          disabled={pref.status !== 'ready'}
          onPress={() => {
            if (pref.status === 'ready')
              background(changeBackupEnabled(store, true), 'photos.backup.enable_failed');
          }}
        />
      }
    />
  );
}

function askAccess(handle: BackupHandle | null): void {
  background(
    backupAccessPort()
      .requestAccess()
      .then(() => handle?.runner.request()),
    'photos.backup.access_failed',
  );
}

function AllowAccess(): ReactNode {
  const handle = useBackupHandle();
  return (
    <EmptyState
      icon="lock"
      title="Allow access to photos"
      body="Backup needs to read this phone’s photos and videos. Choose Allow all so new photos are backed up too."
      action={
        <Button
          label="Allow access"
          variant="tonal"
          onPress={() => {
            askAccess(handle);
          }}
        />
      }
    />
  );
}

function Ring({ status }: { readonly status: BackupStatus }): ReactNode {
  const share = Math.floor(phoneProgressOf(status) * 100) / 100;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`This device ${percent(share)} backed up`}
      className="size-22 items-center justify-center"
    >
      <View className="absolute inset-0">
        <Arc value={share} size={RING} thickness={8} colour="primary" />
      </View>
      <Text variant="body-strong" className="tabular-nums">
        {percent(share)}
      </Text>
    </View>
  );
}

function Conditions({ status }: { readonly status: BackupStatus }): ReactNode {
  const pref = usePref(PREFS.photosBackup);
  if (pref.status !== 'ready') return null;
  const reason = status.phase === 'paused' ? status.pauseReason : null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {conditionChipsOf(pref.value, appPlatform() === 'desktop', reason).map((chip) => (
        <Badge
          key={chip.key}
          label={chip.label}
          icon={chip.icon}
          tone={chip.blocking ? 'warning' : 'neutral'}
        />
      ))}
    </View>
  );
}

function Actions({ status }: { readonly status: BackupStatus }): ReactNode {
  const handle = useBackupHandle();
  const paused = status.phase === 'paused' && status.pauseReason === 'user';
  const working = status.phase === 'scanning' || status.phase === 'uploading';
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Back up now"
        icon="upload"
        variant="filled"
        grow
        disabled={handle === null || working || paused}
        onPress={() => {
          if (handle !== null) background(handle.runner.request(), 'photos.backup.request_failed');
        }}
      />
      <Button
        label={paused ? 'Resume backup' : 'Pause backup'}
        icon={paused ? 'play' : 'pause'}
        variant="tonal"
        grow
        disabled={handle === null}
        onPress={() => {
          if (handle === null) return;
          const change = paused ? handle.runner.resume() : handle.runner.pause();
          background(change, 'photos.backup.pause_failed');
        }}
      />
    </View>
  );
}

function LimitedNote(): ReactNode {
  return (
    <View className="flex-row items-center gap-3 rounded-md bg-surface-3 px-3 py-2">
      <Text variant="footnote" className="min-w-0 flex-1">
        With selected photos only, backup copies just the ones you pick.
      </Text>
      <Button
        label="Choose photos"
        variant="text"
        onPress={() => {
          background(backupAccessPort().presentPicker(), 'photos.backup.picker_failed');
        }}
      />
    </View>
  );
}

function Running({
  status,
  name,
}: {
  readonly status: BackupStatus;
  readonly name: string | null;
}): ReactNode {
  const copy = thisPhoneCopy(
    status,
    name,
    phoneLeftOf(status) ?? 0,
    appPlatform() === 'desktop' ? 'computer' : 'phone',
  );
  const chip = phoneChipOf(status);
  return (
    <Card>
      <View className="gap-3">
        <View className="flex-row items-center gap-4">
          <Ring status={status} />
          <View className="min-w-0 flex-1 gap-1">
            <Text variant="title-3" numberOfLines={1}>
              {copy.title}
            </Text>
            <Text variant="footnote" className="tabular-nums">
              {copy.left}
            </Text>
            <Text variant="caption" tone="variant" className="tabular-nums">
              {copy.detail}
            </Text>
          </View>
          {chip === null ? null : <Badge label={chip.label} tone={copy.tone} />}
        </View>
        {status.problem === null ? null : (
          <Text variant="footnote" tone="critical">
            {status.problem}
          </Text>
        )}
        <Conditions status={status} />
        {status.limitedAccess ? <LimitedNote /> : null}
        <Actions status={status} />
      </View>
    </Card>
  );
}

export function ThisPhoneCard({ name }: { readonly name: string | null }): ReactNode {
  const status = useBackupStatus();
  if (status.phase === 'unavailable') {
    return (
      <Card>
        <UpdateTheApp />
      </Card>
    );
  }
  if (status.phase === 'off') {
    return (
      <Card>
        <TurnOn />
      </Card>
    );
  }
  if (status.phase === 'denied') {
    return (
      <Card>
        <AllowAccess />
      </Card>
    );
  }
  return <Running status={status} name={name} />;
}
