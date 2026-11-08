import { useState } from 'react';
import type { DriveItem, DriveRoot } from '@smarteverything/domain';
import { useFolderFilter, type FolderFilter } from './filter-field';
import type { FolderView } from './folder-header';
import type { FolderData } from './folder-list';
import {
  DEFAULT_SORT,
  itemsOfKind,
  sortItems,
  type ByName,
  type FolderSort,
  type KindFilter,
} from './folder-model';

export interface ArrangeInput {
  readonly root: DriveRoot;
  readonly folderId: string | null;
  readonly data: FolderData;
  readonly online: boolean;
}

export interface Arranged {
  readonly sort: FolderSort;
  readonly kind: KindFilter;
  readonly view: FolderView;
  readonly setSort: (sort: FolderSort) => void;
  readonly setKind: (kind: KindFilter) => void;
  readonly setView: (view: FolderView) => void;
  readonly visible: readonly DriveItem[];
  readonly complete: boolean;
  readonly filter: FolderFilter;
}

export function useArranged(input: ArrangeInput, byName: ByName): Arranged {
  const { root, folderId, data, online } = input;
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [kind, setKind] = useState<KindFilter>('all');
  const [view, setView] = useState<FolderView>('list');
  const complete = data.pages.data !== undefined && !data.pages.hasNextPage;
  const filter = useFolderFilter({
    place: { rootId: root.id, folderId },
    folder: data.folder,
    loaded: data.loaded,
    complete,
    online,
    saveSmart: null,
  });
  const visible = sortItems(itemsOfKind(filter.matches ?? data.loaded, kind), sort, byName);
  return { sort, kind, view, setSort, setKind, setView, visible, complete, filter };
}
