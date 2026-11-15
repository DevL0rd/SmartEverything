import type { FileAbilities } from './abilities';
import type {
  FileLinks,
  FileLocation,
  FileNode,
  FilePlace,
  FileSortOrder,
  FileSource,
  FileSearch,
  FolderListing,
  InfoRow,
  SearchQuery,
  ZipListing,
} from './types';

export function useSourceLinks<O>(source: FileSource<O>, node: FileNode<O>): FileLinks {
  'use no memo';
  return source.useLinks(node);
}

export function useSourceInfo<O>(source: FileSource<O>, node: FileNode<O>): readonly InfoRow[] {
  'use no memo';
  return source.useInfo(node);
}

export function useSourceZip<O>(source: FileSource<O>, node: FileNode<O> | null): ZipListing {
  'use no memo';
  return source.useZip(node);
}

export function useSourceAbilities<O>(
  source: FileSource<O>,
  location: FileLocation,
): FileAbilities {
  'use no memo';
  return source.useAbilities(location);
}

export function useSourcePlaces<O>(source: FileSource<O>): readonly FilePlace[] {
  'use no memo';
  return source.usePlaces();
}

export function useSourceFolder<O>(
  source: FileSource<O>,
  location: FileLocation,
  sort: FileSortOrder,
): FolderListing<O> {
  'use no memo';
  return source.useFolder(location, sort);
}

export function useFileSearch<O>(
  source: FileSource<O>,
  location: FileLocation,
  query: SearchQuery | null,
): FileSearch<O> {
  'use no memo';
  return source.useSearch(location, query);
}
