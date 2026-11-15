import type { FileInput, FileRecord } from './db/index.js';
import type { Found } from './scan.js';

export function hubOf(
  found: Found,
  previous: FileRecord | undefined,
): Pick<FileInput, 'hubRev' | 'hubInode' | 'metaDirty'> {
  const same = previous?.kind === found.kind ? previous : undefined;
  return {
    hubRev: same?.hubRev ?? null,
    hubInode: same?.hubInode ?? null,
    metaDirty: true,
  } as const;
}

export function folderInput(
  found: Found,
  previous: FileRecord | undefined,
  placementId: string,
): FileInput {
  return {
    placementId,
    relPath: found.relPath,
    kind: 'folder',
    bytes: 0,
    mtimeNs: found.mtimeNs,
    mode: found.mode,
    ...hubOf(found, previous),
    localHashState: 'hashed',
    blockSize: null,
    blocks: null,
    linkTarget: null,
    linkKey: null,
    xattrs: found.xattrs,
  };
}

export function linkInput(
  found: Found,
  previous: FileRecord | undefined,
  placementId: string,
): FileInput {
  return {
    placementId,
    relPath: found.relPath,
    kind: 'link',
    bytes: 0,
    mtimeNs: found.mtimeNs,
    mode: found.mode,
    ...hubOf(found, previous),
    localHashState: 'hashed',
    blockSize: null,
    blocks: null,
    linkTarget: found.linkTarget,
    linkKey: null,
    xattrs: [],
  };
}

export function reusedInput(found: Found, previous: FileRecord, placementId: string): FileInput {
  return {
    placementId,
    relPath: found.relPath,
    kind: 'file',
    bytes: found.bytes,
    mtimeNs: found.mtimeNs,
    mode: found.mode,
    ...hubOf(found, previous),
    localHashState: 'hashed',
    blockSize: previous.blockSize,
    blocks: previous.blocks,
    linkTarget: null,
    linkKey: found.linkKey,
    xattrs: found.xattrs,
  };
}
