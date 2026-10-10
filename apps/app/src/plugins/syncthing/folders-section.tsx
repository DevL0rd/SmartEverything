import type { SyncthingFolder, SyncthingSnapshot } from '@smarteverything/domain';
import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { ProgressBar } from '../../components/charts';
import { EmptyState } from '../../components/empty-state';
import { ListRow } from '../../components/list-row';
import { ActionRow, ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import { Sheet } from '../../components/sheet';
import { Skeleton } from '../../components/skeleton';
import { Text } from '../../components/text';
import { bytes, percent } from '../../format/number';
import { joinParts } from '../../format/text';
import { moment } from '../../format/time';
import { useMinute } from '../../store/clock';
import { PluginNotice, StreamProblem } from '../shared/plugin-notice';
import {
  peerName,
  syncthingNotice,
  useSyncthingSnapshot,
  useSyncthingTools,
} from './syncthing-data';

const TYPE_TEXT: Readonly<Record<SyncthingFolder['type'], string>> = {
  sendreceive: 'Send and receive',
  sendonly: 'Send only',
  receiveonly: 'Receive only',
  receiveencrypted: 'Receive encrypted',
};

function statusOf(folder: SyncthingFolder): string {
  if (folder.paused) {
    return 'Paused';
  }
  if (folder.errorCount > 0) {
    return `${String(folder.errorCount)} failed`;
  }
  return folder.needBytes > 0
    ? `${percent(folder.completionPercent / 100)} · ${bytes(folder.needBytes)} left`
    : 'Up to date';
}

function FolderRow({
  folder,
  onPress,
}: {
  readonly folder: SyncthingFolder;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <View>
      <ListRow
        title={folder.label}
        subtitle={statusOf(folder)}
        subtitleTone={folder.errorCount > 0 ? 'critical' : 'variant'}
        icon="folder"
        iconTone={folder.paused ? 'faint' : 'primary'}
        chevron
        onPress={onPress}
      />
      {folder.completionPercent < 100 && !folder.paused ? (
        <ProgressBar
          progress={folder.completionPercent / 100}
          colour="primary"
          label={`${folder.label} progress`}
        />
      ) : null}
    </View>
  );
}

function FolderActions({ folder }: { readonly folder: SyncthingFolder }): ReactNode {
  const tools = useSyncthingTools();
  const target = { kind: 'folder', id: folder.id };
  return (
    <List title="Actions">
      <ActionRow
        title={folder.paused ? 'Resume folder' : 'Pause folder'}
        icon={folder.paused ? 'play' : 'pause'}
        onPress={() =>
          void tools.run('set_paused', { command: 'set_paused', target, paused: !folder.paused })
        }
      />
      <ActionRow
        title="Rescan now"
        icon="refresh"
        onPress={() => void tools.run('rescan', { command: 'rescan', folderId: folder.id })}
      />
      {folder.type === 'sendonly' ? (
        <ActionRow
          title="Make this computer’s files win"
          icon="upload"
          destructive
          onPress={() =>
            void tools.run('resolve_folder', { command: 'override', folderId: folder.id })
          }
        />
      ) : null}
      {folder.type === 'receiveonly' && folder.localChanges > 0 ? (
        <ActionRow
          title="Undo local changes"
          icon="undo"
          destructive
          onPress={() =>
            void tools.run('resolve_folder', { command: 'revert', folderId: folder.id })
          }
        />
      ) : null}
    </List>
  );
}

function FolderFacts({
  folder,
  snapshot,
}: {
  readonly folder: SyncthingFolder;
  readonly snapshot: SyncthingSnapshot;
}): ReactNode {
  const now = useMinute();
  return (
    <List>
      <ValueRow title="Status" value={statusOf(folder)} />
      <ValueRow title="Kind" value={TYPE_TEXT[folder.type]} />
      <ValueRow title="Location" value={folder.path} />
      <ValueRow
        title="Shared with"
        value={joinParts(folder.sharedWith.map((id) => peerName(snapshot, id)))}
      />
      {folder.lastScan === null ? null : (
        <ValueRow title="Last scan" value={moment(folder.lastScan, now)} />
      )}
      {folder.lastFile === null ? null : (
        <ValueRow
          title="Last file"
          value={`${folder.lastFile.name} · ${moment(folder.lastFile.at, now)}`}
        />
      )}
    </List>
  );
}

function FolderSheet({
  folder,
  snapshot,
  onClose,
}: {
  readonly folder: SyncthingFolder | null;
  readonly snapshot: SyncthingSnapshot;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open={folder !== null} onClose={onClose} title={folder?.label ?? 'Folder'} scroll>
      {folder === null ? null : (
        <View className="gap-section-gap">
          <FolderFacts folder={folder} snapshot={snapshot} />
          {folder.stateError === null ? null : (
            <Text variant="callout" tone="critical">
              {folder.stateError}
            </Text>
          )}
          {folder.errors.length === 0 ? null : (
            <List title="Files that failed">
              {folder.errors.map((error) => (
                <ListRow
                  key={error.path}
                  title={error.path}
                  subtitle={error.error}
                  subtitleTone="critical"
                />
              ))}
            </List>
          )}
          <FolderActions folder={folder} />
        </View>
      )}
    </Sheet>
  );
}

export function FoldersSection(): ReactNode {
  const stream = useSyncthingSnapshot();
  const params = useLocalSearchParams<{ folder?: string }>();
  const [openId, setOpenId] = useState<string | null>(params.folder ?? null);
  if (stream.state === 'waiting') {
    return <Skeleton shape="block" />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  const snapshot = stream.value;
  const open = snapshot.folders.find((folder) => folder.id === openId) ?? null;
  return (
    <View className="gap-section-gap">
      <PluginNotice pluginId="syncthing" notice={syncthingNotice(snapshot)} />
      {snapshot.folders.length === 0 ? (
        <EmptyState
          icon="folder"
          title="No synced folders"
          body="Folders you share in Syncthing show up here."
        />
      ) : (
        <List title="Folders">
          {snapshot.folders.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              onPress={() => {
                setOpenId(folder.id);
              }}
            />
          ))}
        </List>
      )}
      <FolderSheet
        folder={open}
        snapshot={snapshot}
        onClose={() => {
          setOpenId(null);
        }}
      />
    </View>
  );
}
