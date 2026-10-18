import type { SyncTarget, SyncthingFolder, SyncthingSnapshot } from '@smarteverything/domain';
import { useMemo } from 'react';
import { notify } from '../../../components/toast-store';
import { useSyncthingTools } from '../syncthing-data';

export interface SyncActions {
  readonly pause: (target: SyncTarget, paused: boolean, name: string | null) => Promise<unknown>;
  readonly rescan: (folderId: string | null) => Promise<unknown>;
  readonly resolve: (command: 'override' | 'revert', folder: SyncthingFolder) => Promise<unknown>;
}

export function unavailableReason(connection: SyncthingSnapshot['connection']): string | null {
  switch (connection.state) {
    case 'online':
      return null;
    case 'connecting':
      return 'Connecting to Syncthing…';
    case 'not_set_up':
    case 'key_rejected':
    case 'unreachable':
      return 'Can’t reach Syncthing right now';
  }
}

export function pauseFailure(paused: boolean, name: string | null): string {
  const verb = paused ? 'pause' : 'resume';
  return name === null ? `Syncing didn’t ${verb}` : `${name} didn’t ${verb}`;
}

export function resolveFailure(command: 'override' | 'revert', label: string): string {
  return command === 'override'
    ? `${label} wasn’t overwritten`
    : `Local changes in ${label} weren’t undone`;
}

export function useSyncActions(): SyncActions {
  const tools = useSyncthingTools();
  return useMemo(
    () => ({
      pause: (target, paused, name) =>
        tools.run(
          'set_paused',
          { command: 'set_paused', target, paused },
          pauseFailure(paused, name),
        ),
      rescan: async (folderId): Promise<void> => {
        const done = await tools.run(
          'rescan',
          { command: 'rescan', folderId },
          'Rescan didn’t start',
        );
        if (done !== null) {
          notify({ message: 'Rescan started' });
        }
      },
      resolve: (command, folder) =>
        tools.run(
          'resolve_folder',
          { command, folderId: folder.id },
          resolveFailure(command, folder.label),
        ),
    }),
    [tools],
  );
}
