import { chmod } from 'node:fs/promises';
import type { SyncXattr } from '@smarteverything/domain/drive-sync';
import { MetaPortError, canonicalXattrs, isUserXattr, type MetaPort } from './meta-port.js';

const UNSUPPORTED_CODES: ReadonlySet<string> = new Set(['ENOTSUP', 'EOPNOTSUPP']);

export interface HubMeta {
  readonly mode: number;
  readonly mtimeNs: bigint;
  readonly xattrs: readonly SyncXattr[];
  readonly inode: number | null;
}

export interface MetaParts {
  readonly mode: boolean;
  readonly xattrs: boolean;
  readonly mtime: boolean;
}

export const ALL_META: MetaParts = { mode: true, xattrs: true, mtime: true };
export const FOLDER_META: MetaParts = { mode: true, xattrs: true, mtime: false };
export const LINK_META: MetaParts = { mode: false, xattrs: false, mtime: true };

export interface MetaTarget {
  readonly meta: MetaPort;
  readonly platform: NodeJS.Platform;
  readonly disk: string;
}

export async function applyHubMeta(
  { meta, platform, disk }: MetaTarget,
  wanted: HubMeta,
  parts: MetaParts,
): Promise<void> {
  if (parts.xattrs && meta.supported) {
    try {
      await meta.applyXattrs(disk, wanted.xattrs.filter(isUserXattr));
    } catch (cause) {
      if (!(cause instanceof MetaPortError) || !UNSUPPORTED_CODES.has(cause.code)) throw cause;
    }
  }
  if (parts.mode && platform !== 'win32') await chmod(disk, wanted.mode);
  if (parts.mtime) await meta.setMtime(disk, wanted.mtimeNs);
}

export function hubXattrsOf(entry: readonly SyncXattr[]): readonly SyncXattr[] {
  return canonicalXattrs(entry);
}

export function modeOf(platform: NodeJS.Platform, mode: bigint, hubMode: number): number {
  return platform === 'win32' ? hubMode : Number(mode & 0o7777n);
}
