import { createHash, randomUUID } from 'node:crypto';
import { blockSizeFor, type SyncIndexEntry } from '@smarteverything/domain/drive-sync';
import type { BlockSource, RemoteFile } from '../../src/drive-sync/transfer.js';

export const BLOCK = 128 * 1024;

export function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function bytesOf(blocks: number, fill: string): Buffer {
  return Buffer.from(fill.repeat(BLOCK * blocks - 7));
}

export function blockHashes(content: Buffer): Buffer {
  const size = blockSizeFor(content.length);
  const hashes: Buffer[] = [];
  for (let at = 0; at < content.length; at += size) {
    hashes.push(
      createHash('sha256')
        .update(content.subarray(at, at + size))
        .digest(),
    );
  }
  return Buffer.concat(hashes);
}

export function remoteOf(rootId: string, itemId: string, content: Buffer): RemoteFile {
  return {
    rootId,
    itemId,
    bytes: content.length,
    blockSize: blockSizeFor(content.length),
    blocksHash: sha256Of(blockHashes(content)),
  };
}

export function fileEntry(
  itemId: string,
  relPath: string,
  content: Buffer,
  rev: number,
): SyncIndexEntry {
  return {
    itemId,
    relPath,
    kind: 'file',
    mtime: '2026-11-01T10:00:00.000Z',
    rev,
    deleted: false,
    bytes: content.length,
    blockSize: blockSizeFor(content.length),
    blocksHash: sha256Of(blockHashes(content)),
  };
}

export function folderEntry(relPath: string, rev: number): SyncIndexEntry {
  return {
    itemId: randomUUID(),
    relPath,
    kind: 'folder',
    mtime: '2026-11-01T10:00:00.000Z',
    rev,
    deleted: false,
  };
}

export function deletedOf(entry: SyncIndexEntry, rev: number): SyncIndexEntry {
  return { ...entry, rev, deleted: true };
}

export class FakeHubFiles implements BlockSource {
  readonly contents = new Map<string, Buffer>();
  readonly fetched: string[] = [];
  failAt: { readonly itemId: string; readonly index: number } | null = null;
  corrupt: { readonly itemId: string; readonly index: number } | null = null;

  hashes(file: RemoteFile): Promise<Uint8Array> {
    const content = this.contents.get(file.itemId);
    return content === undefined
      ? Promise.reject(new Error('unknown item'))
      : Promise.resolve(blockHashes(content));
  }

  block(file: RemoteFile, index: number): Promise<Uint8Array> {
    const content = this.contents.get(file.itemId);
    if (content === undefined) return Promise.reject(new Error('unknown item'));
    if (this.failAt?.itemId === file.itemId && this.failAt.index === index) {
      this.failAt = null;
      return Promise.reject(new Error('connection dropped'));
    }
    this.fetched.push(`${file.itemId}:${String(index)}`);
    const slice = Buffer.from(
      content.subarray(index * file.blockSize, (index + 1) * file.blockSize),
    );
    if (this.corrupt?.itemId === file.itemId && this.corrupt.index === index) slice[0] = 0;
    return Promise.resolve(slice);
  }
}
