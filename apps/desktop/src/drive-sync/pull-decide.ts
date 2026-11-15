import { createHash } from 'node:crypto';
import type { SyncIndexEntry } from '@smarteverything/domain/drive-sync';
import type { FileRecord } from './db/index.js';
import { canonicalXattrs, sameXattrs } from './meta-port.js';
import type { HubMeta } from './meta-apply.js';
import type { LocalBlocks } from './transfer.js';

export type FileEntry = Extract<SyncIndexEntry, { readonly kind: 'file' }>;
export type LinkEntry = Extract<SyncIndexEntry, { readonly kind: 'link' }>;

export type PullContention = 'local_edit' | 'kind_changed' | 'new_on_both' | 'not_empty';

const NS_PER_MS = 1_000_000n;

export type Decision =
  | { readonly action: 'have' | 'adopt' | 'fetch' | 'meta' }
  | { readonly action: 'contended'; readonly reason: PullContention };

export interface Context {
  readonly pending: ReadonlySet<string>;
  readonly tolerance: bigint;
  readonly blocks: () => LocalBlocks;
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function sameContent(local: FileRecord, entry: FileEntry): boolean {
  return (
    local.bytes === entry.bytes &&
    local.blocks !== null &&
    sha256Of(local.blocks) === entry.blocksHash
  );
}

export function momentsMatch(first: bigint, second: bigint, tolerance: bigint): boolean {
  const gap = first > second ? first - second : second - first;
  return gap < NS_PER_MS + tolerance;
}

export function metaMatches(local: FileRecord, entry: SyncIndexEntry, tolerance: bigint): boolean {
  if (local.mode !== entry.mode) return false;
  if (!sameXattrs(local.xattrs, canonicalXattrs(entry.xattrs))) return false;
  return entry.kind !== 'file' || momentsMatch(local.mtimeNs, BigInt(entry.mtimeNs), tolerance);
}

function revAction(local: FileRecord, entry: SyncIndexEntry): Decision {
  return { action: local.hubRev === entry.rev ? 'have' : 'adopt' };
}

function decideMeta(local: FileRecord, entry: SyncIndexEntry, context: Context): Decision {
  if (local.localHashState !== 'hashed' || metaMatches(local, entry, context.tolerance)) {
    return revAction(local, entry);
  }
  if (local.metaDirty || context.pending.has(entry.relPath)) return revAction(local, entry);
  return { action: 'meta' };
}

function decideFile(local: FileRecord, entry: FileEntry, context: Context): Decision {
  if (local.hubRev === entry.rev || sameContent(local, entry)) {
    return decideMeta(local, entry, context);
  }
  if (local.hubRev === null) return { action: 'contended', reason: 'new_on_both' };
  if (local.localHashState !== 'hashed' || context.pending.has(entry.relPath)) {
    return { action: 'contended', reason: 'local_edit' };
  }
  return { action: 'fetch' };
}

function decideLink(local: FileRecord, entry: LinkEntry, context: Context): Decision {
  if (local.linkTarget === entry.target) return revAction(local, entry);
  if (local.hubRev === null) return { action: 'contended', reason: 'new_on_both' };
  if (local.metaDirty || context.pending.has(entry.relPath)) {
    return { action: 'contended', reason: 'local_edit' };
  }
  return { action: 'fetch' };
}

export function decideLive(
  local: FileRecord | undefined,
  entry: SyncIndexEntry,
  context: Context,
): Decision {
  if (local === undefined) return { action: 'fetch' };
  if (local.kind !== entry.kind) return { action: 'contended', reason: 'kind_changed' };
  if (entry.kind === 'folder') return decideMeta(local, entry, context);
  if (entry.kind === 'link') return decideLink(local, entry, context);
  return decideFile(local, entry, context);
}

export function hubMetaOf(entry: SyncIndexEntry): HubMeta {
  return {
    mode: entry.mode,
    mtimeNs: BigInt(entry.mtimeNs),
    xattrs: entry.xattrs,
    inode: entry.kind === 'folder' ? null : entry.inode,
  };
}
