import type { SyncthingFolder, SyncthingSnapshot } from '@smarteverything/domain';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { joinParts } from '../../../format/text';
import { moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { PluginActionRow } from '../../shared/plugin-action';
import { overrideFolder, revertFolder } from '../syncthing-confirmations';
import { CopyRow } from './copy-row';
import { FolderRing } from './folder-ring';
import { folderState, kindText } from './folder-model';
import { PeerChips } from './peer-chips';
import { SheetLead } from './sheet-lead';
import { unavailableReason, useSyncActions, type SyncActions } from './sync-actions';

function Facts({ folder }: { readonly folder: SyncthingFolder }): ReactNode {
  const now = useMinute();
  return (
    <List>
      <ValueRow title="Status" value={folderState(folder).text} />
      <CopyRow title="Location" value={folder.path} />
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

function FailedFiles({ folder }: { readonly folder: SyncthingFolder }): ReactNode {
  return (
    <List title="Files that failed" caption={String(folder.errors.length)}>
      {folder.errors.map((error) => (
        <View key={error.path} className="gap-0.5 px-4 py-2">
          <Text variant="callout" ellipsize="middle">
            {error.path}
          </Text>
          <Text variant="footnote" tone="critical">
            {error.error}
          </Text>
        </View>
      ))}
    </List>
  );
}

interface ActionProps {
  readonly folder: SyncthingFolder;
  readonly actions: SyncActions;
  readonly reason: string | null;
}

function ResolveRow({ folder, actions, reason }: ActionProps): ReactNode {
  if (folder.type === 'sendonly') {
    return (
      <PluginActionRow
        title="Make this computer’s files win"
        icon="upload"
        destructive
        disabled={reason !== null}
        confirmation={overrideFolder(folder.label)}
        onPress={() => actions.resolve('override', folder)}
      />
    );
  }
  if (folder.type === 'receiveonly' && folder.localChanges > 0) {
    return (
      <PluginActionRow
        title="Undo local changes"
        icon="undo"
        destructive
        disabled={reason !== null}
        confirmation={revertFolder(folder.label)}
        onPress={() => actions.resolve('revert', folder)}
      />
    );
  }
  return null;
}

function Actions({
  folder,
  reason,
}: {
  readonly folder: SyncthingFolder;
  readonly reason: string | null;
}): ReactNode {
  const actions = useSyncActions();
  const target = { kind: 'folder', id: folder.id } as const;
  return (
    <List title="Actions">
      <PluginActionRow
        title={folder.paused ? 'Resume folder' : 'Pause folder'}
        icon={folder.paused ? 'play' : 'pause'}
        disabled={reason !== null}
        {...(reason === null ? {} : { subtitle: reason })}
        onPress={() => actions.pause(target, !folder.paused, folder.label)}
      />
      <PluginActionRow
        title="Rescan now"
        icon="refresh"
        disabled={reason !== null}
        onPress={() => actions.rescan(folder.id)}
      />
      <ResolveRow folder={folder} actions={actions} reason={reason} />
    </List>
  );
}

function Body({
  folder,
  snapshot,
  deviceHref,
}: {
  readonly folder: SyncthingFolder;
  readonly snapshot: SyncthingSnapshot;
  readonly deviceHref: (id: string) => Href;
}): ReactNode {
  const state = folderState(folder);
  const sharedWith = snapshot.peers.filter((peer) => folder.sharedWith.includes(peer.id));
  return (
    <View className="gap-section-gap">
      <SheetLead
        ring={
          <FolderRing
            state={state}
            size={40}
            label={`${folder.label}, ${String(state.percent)} percent synced`}
          />
        }
        subtitle={joinParts([state.text, kindText(folder)])}
      />
      <Facts folder={folder} />
      {sharedWith.length === 0 ? null : <PeerChips peers={sharedWith} href={deviceHref} />}
      {folder.stateError === null ? null : (
        <Text variant="callout" tone="critical">
          {folder.stateError}
        </Text>
      )}
      {folder.errors.length === 0 ? null : <FailedFiles folder={folder} />}
      <Actions folder={folder} reason={unavailableReason(snapshot.connection)} />
    </View>
  );
}

export function FolderSheet({
  folder,
  snapshot,
  deviceHref,
  onClose,
}: {
  readonly folder: SyncthingFolder | null;
  readonly snapshot: SyncthingSnapshot;
  readonly deviceHref: (id: string) => Href;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open={folder !== null} onClose={onClose} title={folder?.label ?? 'Folder'} scroll>
      {folder === null ? null : (
        <Body folder={folder} snapshot={snapshot} deviceHref={deviceHref} />
      )}
    </Sheet>
  );
}
