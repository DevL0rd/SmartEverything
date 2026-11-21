import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  folderSyncingWords,
  syncingSpeedWords,
  syncingWords,
  type DesktopDriveFolderSyncing,
  type DesktopDriveSyncing,
} from '@smarteverything/domain';
import { SegmentBar } from '../../../components/charts';
import { Text } from '../../../components/text';
import { bytes, count } from '../../../format/number';
import { plural } from '../../../format/text';

export function syncDetailsOf(syncing: DesktopDriveSyncing): string {
  const files = syncing.sentFiles + syncing.files;
  return [
    `${count(syncing.sentFiles)} of ${plural(files, 'file')}`,
    `${bytes(syncing.sentBytes)} of ${bytes(syncing.sentBytes + syncing.bytes)}`,
    `${count(syncing.files)} left`,
  ].join(' · ');
}

function SyncProgress({
  label,
  syncing,
  current,
}: {
  readonly label: string;
  readonly syncing: DesktopDriveSyncing;
  readonly current: string | null;
}): ReactNode {
  const speed = syncingSpeedWords(syncing);
  const byBytes = syncing.sentBytes + syncing.bytes > 0;
  return (
    <View className="gap-1">
      <SegmentBar
        label={label}
        segments={[
          {
            label: 'Synced',
            value: byBytes ? syncing.sentBytes : syncing.sentFiles,
            colour: 'primary',
          },
        ]}
        total={byBytes ? syncing.sentBytes + syncing.bytes : syncing.sentFiles + syncing.files}
        size="regular"
        legend
        format={byBytes ? bytes : count}
      />
      <Text variant="footnote" tone="variant" className="tabular">
        {syncDetailsOf(syncing)}
      </Text>
      {current === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {`Now: ${current}`}
        </Text>
      )}
      {speed === null ? null : (
        <Text variant="footnote" tone="variant" className="tabular">
          {speed}
        </Text>
      )}
    </View>
  );
}

export function MountSyncBar({
  syncing,
}: {
  readonly syncing: DesktopDriveSyncing | null;
}): ReactNode {
  if (syncing === null) return null;
  return <SyncProgress label={syncingWords(syncing)} syncing={syncing} current={null} />;
}

export function FolderSyncBar({
  folder,
}: {
  readonly folder: DesktopDriveFolderSyncing | null;
}): ReactNode {
  if (folder === null) return null;
  return (
    <SyncProgress label={folderSyncingWords(folder)} syncing={folder} current={folder.current} />
  );
}
