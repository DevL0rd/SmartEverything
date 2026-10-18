import type { SyncthingFolder } from '@smarteverything/domain';
import { useMemo, type ReactNode } from 'react';
import { List } from '../../components/section';
import { PluginActionRow } from '../shared/plugin-action';
import { useSyncActions, type SyncActions } from './model/sync-actions';
import { useSyncthingSnapshot } from './syncthing-data';

export interface SyncCellActions {
  readonly pauseAll: (paused: boolean) => Promise<unknown>;
  readonly rescanAll: () => Promise<unknown>;
  readonly pauseFolder: (folder: SyncthingFolder) => Promise<unknown>;
}

export function useSyncCellActions(): SyncCellActions {
  const actions: SyncActions = useSyncActions();
  return useMemo(
    () => ({
      pauseAll: (paused) => actions.pause({ kind: 'all' }, paused, null),
      rescanAll: () => actions.rescan(null),
      pauseFolder: (folder) =>
        actions.pause({ kind: 'folder', id: folder.id }, !folder.paused, folder.label),
    }),
    [actions],
  );
}

export function SyncQuickActions(): ReactNode {
  const actions = useSyncCellActions();
  const stream = useSyncthingSnapshot();
  const ready = stream.state === 'ready' && stream.value.connection.state === 'online';
  const snapshot = stream.state === 'ready' ? stream.value : null;
  const paused = snapshot?.summary.state === 'paused';
  return (
    <List>
      <PluginActionRow
        title={paused ? 'Resume all syncing' : 'Pause all syncing'}
        icon={paused ? 'play' : 'pause'}
        disabled={!ready}
        onPress={() => actions.pauseAll(!paused)}
      />
      <PluginActionRow
        title="Rescan all folders"
        icon="refresh"
        disabled={!ready}
        onPress={actions.rescanAll}
      />
      {(snapshot?.folders ?? []).map((folder) => (
        <PluginActionRow
          key={folder.id}
          title={folder.paused ? `Resume ${folder.label}` : `Pause ${folder.label}`}
          icon={folder.paused ? 'play' : 'pause'}
          disabled={!ready}
          onPress={() => actions.pauseFolder(folder)}
        />
      ))}
    </List>
  );
}
