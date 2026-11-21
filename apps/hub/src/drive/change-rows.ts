import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { DRIVE_VERSION, type DriveVersion, type DriveVia } from '@smarteverything/domain';
import type { DriveItemDraft, DriveItemIdentity } from '../store/repositories/drive-items';
import type { FileItem } from './file-item';
import { purgeDeadline, type FileEnv, type FileStamp } from './intents';
import type { FileType } from './scanner-drafts';

export function isoOf(mtimeNs: bigint): string {
  return new Date(Number(mtimeNs / 1_000_000n)).toISOString();
}

export function identityOf(stamp: FileStamp): DriveItemIdentity {
  return { dev: stamp.dev.toString(), ino: stamp.ino.toString() };
}

interface Common {
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
  readonly remoteId: null;
  readonly remoteRev: null;
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

export interface NewItem {
  readonly rootId: string;
  readonly parentId: string | null;
  readonly relPath: string;
  readonly modifiedAt: string;
  readonly addedAt: string;
  readonly outside: boolean;
  readonly addedByProfileId: string | null;
  readonly id?: string;
}

export function commonOf(item: NewItem): Common {
  return {
    id: item.id ?? randomUUID(),
    rootId: item.rootId,
    parentId: item.parentId,
    relPath: item.relPath,
    name: basename(item.relPath),
    modifiedAt: item.modifiedAt,
    addedAt: item.addedAt,
    starred: false,
    shared: false,
    outside: item.outside,
    addedByProfileId: item.addedByProfileId,
    remoteId: null,
    remoteRev: null,
  };
}

export interface FileContent {
  readonly bytes: number;
  readonly sha256: string | null;
}

export function fileDraftOf(item: NewItem, content: FileContent, type: FileType): DriveItemDraft {
  const common = commonOf(item);
  const { mime, kind } = type;
  const file = {
    ...common,
    mime,
    bytes: content.bytes,
    sha256: content.sha256,
    integrity: content.sha256 === null ? 'unknown' : 'ok',
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

export function replacedDraft(
  existing: FileItem,
  stamp: FileStamp,
  sha256: string | null,
): DriveItemDraft {
  return {
    ...existing,
    bytes: stamp.size,
    modifiedAt: isoOf(stamp.mtimeNs),
    sha256,
    integrity: sha256 === null ? 'unknown' : 'ok',
    thumb: { state: 'none' },
    outside: false,
  };
}

export interface VersionSource {
  readonly itemId: string;
  readonly rev: number;
  readonly sha256: string;
  readonly bytes: number;
  readonly actorProfileId: string | null;
  readonly via: DriveVia;
  readonly deviceId: string | null;
  readonly addedByProfileId: string | null;
}

export function newVersion(env: Pick<FileEnv, 'now'>, source: VersionSource): DriveVersion {
  const at = env.now().toISOString();
  return DRIVE_VERSION.parse({ ...source, id: randomUUID(), at, purgeAt: purgeDeadline(at) });
}
