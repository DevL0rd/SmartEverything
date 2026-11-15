import type { ComponentType } from 'react';
import type { DriveFolderColour, DriveZipEntry, DriveZipTotals } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { TextRange } from '../../../components/highlighted';
import type { PickedBlob } from '../../../platform/pick-files';
import type { FileAbilities } from './abilities';
import type { FileOp, OpResult } from './ops';

export const FILE_NODE_KINDS = [
  'folder',
  'image',
  'video',
  'audio',
  'document',
  'archive',
  'link',
  'special',
  'other',
] as const;

export type FileNodeKind = (typeof FILE_NODE_KINDS)[number];

export type OfflineMark = 'waiting' | 'ready' | 'failed';

export type PlacementMark = 'synced' | 'mounted';

export interface ShortcutMark {
  readonly unavailable: string | null;
}

export interface EntryNote {
  readonly line: string;
  readonly stays: string;
}

export interface FileMarks {
  readonly starred: boolean;
  readonly shared: boolean;
  readonly locked: boolean;
  readonly comments: number;
  readonly offline: OfflineMark | null;
  readonly shortcut: ShortcutMark | null;
  readonly placement: PlacementMark | null;
  readonly colour: DriveFolderColour | null;
  readonly iconHint: boolean;
}

export interface FileNode<O = unknown> {
  readonly key: string;
  readonly parentKey: string | null;
  readonly name: string;
  readonly kind: FileNodeKind;
  readonly mime: string | null;
  readonly size: number | null;
  readonly childCount: number | null;
  readonly modifiedAt: string | null;
  readonly hidden: boolean;
  readonly byProfileId: string | null;
  readonly marks: FileMarks;
  readonly exportable: boolean;
  readonly writable: boolean;
  readonly deletable: boolean;
  readonly entry: EntryNote | null;
  readonly origin: O;
}

export interface FileLocation {
  readonly place: string;
  readonly folder: string | null;
}

export const PLACE_KINDS = [
  'my_drive',
  'shared_drive',
  'shared_with_me',
  'home',
  'root',
  'folder',
  'volume',
  'trash',
] as const;

export type FilePlaceKind = (typeof PLACE_KINDS)[number];

export interface FilePlace {
  readonly key: string;
  readonly label: string;
  readonly kind: FilePlaceKind;
  readonly location: FileLocation;
}

export interface FileCrumb<O = unknown> {
  readonly key: string;
  readonly label: string;
  readonly location: FileLocation;
  readonly leading?: FileNode<O>;
}

export const SORT_FIELDS = ['name', 'by', 'size', 'modifiedAt'] as const;

export type SortField = (typeof SORT_FIELDS)[number];

export type SortDirection = 'asc' | 'desc';

export interface FileSortOrder {
  readonly field: SortField;
  readonly direction: SortDirection;
}

export interface FolderListing<O = unknown> {
  readonly entries: readonly FileNode<O>[];
  readonly folder: FileNode<O> | null;
  readonly crumbs: readonly FileCrumb<O>[];
  readonly total: number | null;
  readonly complete: boolean;
  readonly loading: boolean;
  readonly stale: boolean;
  readonly error: unknown;
  readonly more: (() => void) | null;
  readonly retry: () => void;
}

export type HitWhere = 'name' | 'text' | 'image_text';

export interface FileHit {
  readonly where: HitWhere;
  readonly snippet: string | null;
  readonly line: number | null;
  readonly ranges: readonly TextRange[];
}

export interface SearchMatch<O = unknown> {
  readonly node: FileNode<O>;
  readonly hit: FileHit;
}

export interface SearchQuery {
  readonly text: string;
  readonly contents: boolean;
}

export interface FileSearch<O = unknown> {
  readonly matches: readonly SearchMatch<O>[];
  readonly scanned: number | null;
  readonly running: boolean;
  readonly error: unknown;
  readonly more: (() => void) | null;
  readonly stop: (() => void) | null;
}

export interface FileLinks {
  readonly file: string | null;
  readonly thumb: string | null;
  readonly download: string | null;
  readonly icon: string | null;
}

export interface ZipListing {
  readonly entries: readonly DriveZipEntry[];
  readonly totals: DriveZipTotals | null;
  readonly loading: boolean;
  readonly error: unknown;
  readonly more: (() => void) | null;
  readonly entryLink: (index: number) => Promise<string>;
}

export interface UploadJob {
  readonly id: string;
  readonly file: PickedBlob;
  readonly folder: FileLocation;
  readonly name: string;
  readonly replace: boolean;
}

export type UploadOutcome =
  | { readonly kind: 'done'; readonly name: string; readonly renamed: boolean }
  | { readonly kind: 'have' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly text: string; readonly retryable: boolean };

export interface UploadHandle {
  readonly outcome: Promise<UploadOutcome>;
  readonly pause: () => Promise<void>;
  readonly resume: () => void;
  readonly cancel: () => Promise<void>;
}

export type ConflictRule = 'ask' | 'number';

export interface UploadTransport {
  readonly conflicts: ConflictRule;
  readonly serial: boolean;
  readonly start: (job: UploadJob, progress: (sent: number) => void) => UploadHandle;
}

export interface DownloadSkip {
  readonly path: string;
  readonly reason: string;
}

export interface DownloadPlanView {
  readonly kind: 'file' | 'zip';
  readonly name: string;
  readonly size: number | null;
  readonly files: number;
  readonly folders: number;
  readonly bytes: number;
  readonly skipped: readonly DownloadSkip[];
  readonly url: string;
  readonly expiresAt: string;
}

export interface PreparedDownload {
  readonly download: DownloadPlanView;
  readonly url: string;
}

export interface SourceActionSpec<O = unknown> {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly many: boolean;
  readonly run: (nodes: readonly FileNode<O>[]) => void;
}

export interface SourceTabSpec<O = unknown> {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly Tab: ComponentType<{ readonly node: FileNode<O> }>;
}

export interface SourceInfoSpec<O = unknown> {
  readonly id: string;
  readonly Section: ComponentType<{ readonly node: FileNode<O> }>;
}

export interface InfoRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface FileSource<O = unknown> {
  readonly id: string;
  readonly label: string;
  readonly useAbilities: (location: FileLocation) => FileAbilities;
  readonly usePlaces: () => readonly FilePlace[];
  readonly useFolder: (location: FileLocation, sort: FileSortOrder) => FolderListing<O>;
  readonly useSearch: (location: FileLocation, query: SearchQuery | null) => FileSearch<O>;
  readonly useLinks: (node: FileNode<O>) => FileLinks;
  readonly useZip: (node: FileNode<O> | null) => ZipListing;
  readonly useInfo: (node: FileNode<O>) => readonly InfoRow[];
  readonly infoSections: (node: FileNode<O>) => readonly SourceInfoSpec<O>[];
  readonly locationOf: (typed: string) => FileLocation | null;
  readonly openTargetOf?: (node: FileNode<O>) => FileNode<O>;
  readonly run: (op: FileOp<O>) => Promise<OpResult>;
  readonly upload: UploadTransport;
  readonly download: (nodes: readonly FileNode<O>[]) => Promise<PreparedDownload>;
  readonly actions: (nodes: readonly FileNode<O>[]) => readonly SourceActionSpec<O>[];
  readonly tabs: (node: FileNode<O>) => readonly SourceTabSpec<O>[];
}

export function sameLocation(first: FileLocation, second: FileLocation): boolean {
  return first.place === second.place && first.folder === second.folder;
}

export function locationKeyOf(location: FileLocation): string {
  return location.folder === null ? location.place : `${location.place}\n${location.folder}`;
}
