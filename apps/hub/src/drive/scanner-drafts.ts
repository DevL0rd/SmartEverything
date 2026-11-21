import type { DriveItem } from '@smarteverything/domain';
import type { DriveItemDraft } from '../store/repositories/drive-items';
import type { WalkEntry } from './scanner-walk';

export interface FileType {
  readonly mime: string;
  readonly kind: 'image' | 'video' | 'audio' | 'document' | 'other';
}

export type ScanEntry = WalkEntry & { readonly type: FileType };

export class ScanStepError extends Error {
  override readonly name = 'ScanStepError';
}

export interface Common {
  readonly id: string;
  readonly rootId: string;
  readonly parentId: string | null;
  readonly relPath: string;
  readonly name: string;
  readonly modifiedAt: string;
  readonly addedAt: string;
  readonly starred: false;
  readonly shared: false;
  readonly outside: boolean;
  readonly addedByProfileId: string | null;
  readonly remoteId: string | null;
  readonly remoteRev: string | null;
}

const NO_MEDIA = {
  takenAt: null,
  width: null,
  height: null,
  orientation: null,
  camera: null,
  exposure: null,
  place: null,
} as const;

function fileDraft(common: Common, entry: WalkEntry, type: FileType): DriveItemDraft {
  const { mime, kind } = type;
  const file = {
    ...common,
    mime,
    bytes: entry.bytes,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
  } as const;
  switch (kind) {
    case 'image':
      return { ...file, ...NO_MEDIA, kind };
    case 'video':
      return { ...file, ...NO_MEDIA, kind, durationMs: null };
    case 'audio':
      return { ...file, kind, takenAt: null, durationMs: null };
    case 'document':
    case 'other':
      return { ...file, kind };
  }
}

export function freshDraft(common: Common, entry: WalkEntry, type: FileType): DriveItemDraft {
  switch (entry.kind) {
    case 'folder':
      return { ...common, kind: 'folder', childCount: entry.childCount ?? 0, bytes: entry.bytes };
    case 'link':
      return { ...common, kind: 'link', bytes: entry.bytes, linkTarget: entry.target };
    case 'special':
      return { ...common, kind: 'special', bytes: 0 };
    case 'file':
      return fileDraft(common, entry, type);
  }
}

export function resolveUnreadable(entry: WalkEntry, base: DriveItem | null): WalkEntry {
  if (entry.kind !== 'folder' || entry.childCount !== null || base?.kind !== 'folder') {
    return entry;
  }
  return { ...entry, childCount: base.childCount, bytes: base.bytes };
}

export function ownersOf(
  base: DriveItem | null,
): Pick<Common, 'addedByProfileId' | 'remoteId' | 'remoteRev'> {
  return {
    addedByProfileId: base?.addedByProfileId ?? null,
    remoteId: base?.remoteId ?? null,
    remoteRev: base?.remoteRev ?? null,
  };
}
