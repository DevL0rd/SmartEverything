import type { FileEntry, FileSearchMatch, FileTrashEntry } from '@smarteverything/domain';
import {
  NO_MARKS,
  kindOfFile,
  type EntryNote,
  type FileHit,
  type FileMarks,
  type FileNode,
  type FileNodeKind,
  type PlacementMark,
  type SearchMatch,
} from '../../files';
import { normalPath, parentOf } from './computer-path';

export interface ComputerOrigin {
  readonly path: string;
  readonly trashId: string | null;
}

export type ComputerNode = FileNode<ComputerOrigin>;

export type ComputerMatch = SearchMatch<ComputerOrigin>;

export interface PlacedPath {
  readonly path: string;
  readonly mark: PlacementMark;
}

export interface PlacementSource {
  readonly deviceId: string;
  readonly localPath: string | null;
  readonly status: { readonly mountPoint: string | null };
}

export function placedPathsOf(
  deviceId: string,
  placements: readonly PlacementSource[],
): readonly PlacedPath[] {
  return placements
    .filter((placement) => placement.deviceId === deviceId)
    .flatMap((placement): PlacedPath[] => {
      if (placement.localPath !== null) {
        return [{ path: normalPath(placement.localPath), mark: 'synced' }];
      }
      const point = placement.status.mountPoint;
      return point === null ? [] : [{ path: normalPath(point), mark: 'mounted' }];
    });
}

export function placementMarkOf(path: string, placed: readonly PlacedPath[]): PlacementMark | null {
  const clean = normalPath(path);
  return placed.find((item) => item.path === clean)?.mark ?? null;
}

function marksOf(path: string, placed: readonly PlacedPath[], folder: boolean): FileMarks {
  const placement = folder ? placementMarkOf(path, placed) : null;
  return placement === null ? NO_MARKS : { ...NO_MARKS, placement };
}

function kindOfEntry(entry: Pick<FileEntry, 'kind' | 'mime' | 'name'>): FileNodeKind {
  switch (entry.kind) {
    case 'folder':
      return 'folder';
    case 'link':
      return 'link';
    case 'other':
      return 'special';
    case 'file':
      return kindOfFile(entry.mime, entry.name);
  }
}

const SPECIAL_ENTRY_NOTE: EntryNote = {
  line: 'Pipe, socket or device entry',
  stays: 'It stays on this computer and cannot be opened or downloaded.',
};

function entryNoteOf(kind: FileNodeKind): EntryNote | null {
  return kind === 'special' ? SPECIAL_ENTRY_NOTE : null;
}

export function nodeOfEntry(
  entry: FileEntry,
  writable: boolean,
  placed: readonly PlacedPath[],
): ComputerNode {
  const kind = kindOfEntry(entry);
  return {
    key: entry.path,
    parentKey: parentOf(entry.path),
    name: entry.name,
    kind,
    mime: entry.mime,
    size: kind === 'folder' ? null : entry.size,
    childCount: null,
    modifiedAt: entry.modifiedAt,
    hidden: entry.hidden,
    byProfileId: null,
    marks: marksOf(entry.path, placed, kind === 'folder'),
    exportable: kind !== 'special',
    writable,
    deletable: writable,
    entry: entryNoteOf(kind),
    origin: { path: entry.path, trashId: null },
  };
}

export function nodeOfFolder(
  path: string,
  name: string,
  writable: boolean,
  placed: readonly PlacedPath[],
): ComputerNode {
  return {
    key: path,
    parentKey: parentOf(path),
    name,
    kind: 'folder',
    mime: null,
    size: null,
    childCount: null,
    modifiedAt: null,
    hidden: false,
    byProfileId: null,
    marks: marksOf(path, placed, true),
    exportable: true,
    writable,
    deletable: writable,
    entry: null,
    origin: { path, trashId: null },
  };
}

export function nodeOfTrash(entry: FileTrashEntry): ComputerNode {
  const kind = kindOfEntry({ kind: entry.kind, mime: null, name: entry.name });
  return {
    key: entry.trashId,
    parentKey: null,
    name: entry.name,
    kind,
    mime: null,
    size: kind === 'folder' ? null : entry.size,
    childCount: null,
    modifiedAt: entry.deletedAt,
    hidden: false,
    byProfileId: null,
    marks: NO_MARKS,
    exportable: false,
    writable: true,
    deletable: true,
    entry: entryNoteOf(kind),
    origin: { path: entry.originalPath, trashId: entry.trashId },
  };
}

function hitOf(match: FileSearchMatch): FileHit {
  const { hit } = match;
  return {
    where: hit.kind,
    snippet: hit.kind === 'name' ? null : hit.snippet,
    line: hit.line,
    ranges: hit.ranges,
  };
}

export function matchOf(
  match: FileSearchMatch,
  writable: boolean,
  placed: readonly PlacedPath[],
): ComputerMatch {
  return { node: nodeOfEntry(match.entry, writable, placed), hit: hitOf(match) };
}
