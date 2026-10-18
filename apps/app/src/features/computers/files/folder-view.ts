import type { UseQueryResult } from '@tanstack/react-query';
import type { FileList } from '@smarteverything/domain';
import type { ComputerReach } from '../data/computer-scopes';
import type { FolderView } from './folder-list';
import { background } from '@smarteverything/logging';

function blocked(reach: ComputerReach): FolderView | null {
  if (!reach.online) {
    return {
      kind: 'blocked',
      icon: 'wifiOff',
      title: `${reach.name} is offline`,
      body: 'Folders can be browsed when it is back.',
    };
  }
  return null;
}

export function folderView(reach: ComputerReach, folder: UseQueryResult<FileList>): FolderView {
  const stopped = blocked(reach);
  if (stopped !== null) return stopped;
  if (folder.isError) {
    return {
      kind: 'error',
      error: folder.error,
      retry: (): void => {
        background(folder.refetch(), 'folder.refetch_failed');
      },
    };
  }
  if (folder.data === undefined) return { kind: 'loading' };
  return { kind: 'ready', list: folder.data, stale: folder.isPlaceholderData };
}
