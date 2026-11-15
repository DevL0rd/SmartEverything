import { listDriveZipEntries, readDriveZipEntryLink } from '../../../api/drive';
import { moment } from '../../../format/time';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';
import { useMinute } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import {
  filterWordsOf,
  type FileLinks,
  type FileLocation,
  type FileSearch,
  type InfoRow,
  type SearchQuery,
  type ZipListing,
} from '../../files';
import { flattenPages, useDriveChips, useDriveLink, useDriveSearch } from '../data';
import { useDrivePages } from '../data/pages';
import { driveQueryOf, infoRowsOf, searchMatchesOf } from './drive-listing';
import { itemOf, type DriveNode, type DriveOrigin } from './drive-node';
import { DRIVE_PLACES } from './drive-places';
import { useDriveLocation, type DriveLocationState } from './drive-location';
import { pageStateOf } from './drive-folder';

function searchScopeOf(
  state: DriveLocationState,
  location: FileLocation,
  query: SearchQuery | null,
): boolean {
  const { place } = state;
  const inPlace =
    place !== DRIVE_PLACES.trash &&
    !(place === DRIVE_PLACES.sharedWithMe && location.folder === null);
  const words = query === null ? [] : filterWordsOf(query.text);
  return words.length > 0 && state.online && inPlace && state.rootId !== null;
}

export function useDriveSearchResults(
  location: FileLocation,
  query: SearchQuery | null,
): FileSearch<DriveOrigin> {
  const state = useDriveLocation(location);
  const asked = searchScopeOf(state, location, query);
  const pages = useDriveSearch(
    driveQueryOf(query ?? { text: '', contents: false }, {
      rootId: state.rootId,
      folderId: location.folder,
    }),
    asked,
  );
  const paging = pageStateOf(pages, asked);
  return {
    matches:
      asked && query !== null
        ? searchMatchesOf(
            {
              items: flattenPages(pages.data, (page) => page.items),
              hits: flattenPages(pages.data, (page) => page.hits),
              shortcuts: flattenPages(pages.data, (page) => page.shortcuts),
            },
            query,
            state.context,
          )
        : [],
    scanned: null,
    running: asked && (pages.isFetching || pages.isPending),
    error: paging.error,
    more: paging.more,
    stop: null,
  };
}

export function useDriveLinks(node: DriveNode): FileLinks {
  const item = itemOf(node);
  const id = item?.id ?? null;
  const rev = item?.rev ?? 0;
  const file = useDriveLink(id, rev, 'file');
  const thumb = useDriveLink(id, rev, 'thumb');
  const download = useDriveLink(
    node.exportable && node.kind !== 'folder' ? id : null,
    rev,
    'download',
  );
  const icon = useDriveLink(node.marks.iconHint ? id : null, rev, 'icon');
  return {
    file: node.kind === 'folder' ? null : file,
    thumb,
    download,
    icon,
  };
}

const NO_ZIP: ZipListing = {
  entries: [],
  totals: null,
  loading: false,
  error: null,
  more: null,
  entryLink: () => Promise.reject(new Error('This is not a zip archive.')),
};

function zipTargetOf(node: DriveNode | null): { readonly id: string; readonly rev: number } | null {
  const item = node === null ? null : itemOf(node);
  return item !== null && node?.kind === 'archive' ? { id: item.id, rev: item.rev } : null;
}

export function useDriveZip(node: DriveNode | null): ZipListing {
  const target = zipTargetOf(node);
  const pages = useDrivePages({
    queryKey: driveKey('zip-entries', DRIVE_EVERYWHERE, target?.id ?? null, target?.rev ?? 0),
    read: (cursor) => listDriveZipEntries(target?.id ?? '', cursor),
    enabled: target !== null,
  });
  const paging = pageStateOf(pages, target !== null);
  if (target === null) return NO_ZIP;
  return {
    entries: flattenPages(pages.data, (page) => page.items),
    totals: pages.data?.pages[0]?.totals ?? null,
    loading: paging.pending,
    error: paging.error,
    more: paging.more,
    entryLink: async (index) => (await readDriveZipEntryLink(target.id, index)).file.url,
  };
}

export function useDriveInfo(node: DriveNode): readonly InfoRow[] {
  const now = useMinute();
  const profiles = useProfiles();
  const chipOf = useDriveChips();
  return infoRowsOf(node, {
    when: (at) => moment(at, now),
    nameOf: (profileId) => profiles.find((profile) => profile.id === profileId)?.name ?? null,
    rootLabelOf: (rootId) => chipOf(rootId).label,
  });
}
