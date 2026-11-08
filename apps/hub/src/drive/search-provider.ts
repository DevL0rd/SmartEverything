import type { DriveItem, DriveQuery, NavTarget } from '@smarteverything/domain';
import type { DriveSearch, DriveViewer } from './search';

export interface DriveHit {
  readonly id: string;
  readonly name: string;
  readonly kind: DriveItem['kind'];
  readonly rootId: string;
  readonly path: string;
  readonly target: NavTarget;
}

export interface DriveHitInput {
  readonly query: string;
  readonly limit: number;
}

function directoryOf(relPath: string): string {
  const slash = relPath.lastIndexOf('/');
  return slash < 0 ? '/' : `/${relPath.slice(0, slash)}`;
}

function targetOf(item: DriveItem): NavTarget {
  return item.kind === 'folder'
    ? { kind: 'drive', rootId: item.rootId, path: `/${item.relPath}`, itemId: null, focus: null }
    : {
        kind: 'drive',
        rootId: item.rootId,
        path: directoryOf(item.relPath),
        itemId: item.id,
        focus: null,
      };
}

function hitOf(item: DriveItem): DriveHit {
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    rootId: item.rootId,
    path: item.relPath,
    target: targetOf(item),
  };
}

export function driveHits(
  search: Pick<DriveSearch, 'search'>,
  viewer: DriveViewer,
  { query, limit }: DriveHitInput,
): DriveHit[] {
  const request: DriveQuery = {
    text: query,
    rootId: null,
    folderId: null,
    kinds: null,
    starred: null,
    duration: null,
    taken: null,
    sort: { field: 'modifiedAt', direction: 'desc' },
    cursor: null,
  };
  return search.search(viewer, request, limit).items.map(hitOf);
}
