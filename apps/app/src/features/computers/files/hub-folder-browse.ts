import { useState } from 'react';
import { keepPreviousData, type UseQueryResult } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type DriveHostFolders } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useSyncStatus } from '../../../store/selectors';
import type { FolderView } from './folder-list';
import type { Crumb } from './path-model';

export const HUB_NAME = 'Hub';

export const HUB_DISKS_PATH = '';

const DISKS_CRUMB: Crumb = { label: 'Hub disks', path: HUB_DISKS_PATH };

export type HubFolderView =
  | Exclude<FolderView, { readonly kind: 'ready' }>
  | { readonly kind: 'ready'; readonly listing: DriveHostFolders; readonly stale: boolean };

export interface HubFolderBrowse {
  readonly folder: UseQueryResult<DriveHostFolders>;
  readonly roots: readonly string[];
  readonly here: string | null;
  readonly online: boolean;
  readonly showHidden: boolean;
  readonly setShowHidden: (value: boolean) => void;
  readonly go: (path: string) => void;
}

function useHostFolders(path: string | null, enabled: boolean): UseQueryResult<DriveHostFolders> {
  return useScreenQuery({
    queryKey: ['window', 'drive-host-folders', path],
    queryFn: () => api().call(E.listHostFolders, { query: path === null ? {} : { path } }),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useHubFolderBrowse(start: string | null): HubFolderBrowse {
  const [path, setPath] = useState<string | null>(start);
  const [showHidden, setShowHidden] = useState(false);
  const online = useSyncStatus().status === 'live';
  const folder = useHostFolders(path, online);
  const disks = useHostFolders(null, online).data?.folders ?? [];
  return {
    folder,
    roots: disks.map((disk) => disk.path),
    here: folder.data?.path ?? null,
    online,
    showHidden,
    setShowHidden,
    go: (next: string): void => {
      setPath(next === HUB_DISKS_PATH ? null : next);
    },
  };
}

function insideRoot(path: string, root: string): boolean {
  if (path === root) return true;
  return path.startsWith(root.endsWith('/') ? root : `${root}/`);
}

function rootOf(path: string, roots: readonly string[]): string | null {
  return roots
    .filter((root) => insideRoot(path, root))
    .reduce<string | null>(
      (best, root) => (best === null || root.length > best.length ? root : best),
      null,
    );
}

export function hubCrumbs(path: string | null, roots: readonly string[]): readonly Crumb[] {
  if (path === null) return [DISKS_CRUMB];
  const root = rootOf(path, roots);
  if (root === null) return [DISKS_CRUMB, { label: path, path }];
  const rest = path
    .slice(root.length)
    .split('/')
    .filter((part) => part !== '');
  return rest.reduce<readonly Crumb[]>(
    (crumbs, part) => {
      const parent = crumbs.at(-1)?.path ?? root;
      return [
        ...crumbs,
        { label: part, path: `${parent.endsWith('/') ? parent : `${parent}/`}${part}` },
      ];
    },
    [DISKS_CRUMB, { label: root, path: root }],
  );
}

export type HostFoldersQuery = Pick<
  UseQueryResult<DriveHostFolders>,
  'data' | 'error' | 'isError' | 'isPlaceholderData' | 'refetch'
>;

export function hubFolderView(online: boolean, folder: HostFoldersQuery): HubFolderView {
  if (!online) {
    return {
      kind: 'blocked',
      icon: 'wifiOff',
      title: `${HUB_NAME} is offline`,
      body: 'Folders can be browsed when it is back.',
    };
  }
  if (folder.isError) {
    return {
      kind: 'error',
      error: folder.error,
      retry: (): void => {
        background(folder.refetch(), 'hub_folder.refetch_failed');
      },
    };
  }
  if (folder.data === undefined) return { kind: 'loading' };
  return { kind: 'ready', listing: folder.data, stale: folder.isPlaceholderData };
}
