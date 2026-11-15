import { createHash } from 'node:crypto';
import { lutimes, readFile } from 'node:fs/promises';
import { blockSizeFor, type SyncXattr } from '@smarteverything/domain/drive-sync';
import {
  FileChangedWhileHashingError,
  type BlockHasher,
  type HashedFile,
} from '../../src/drive-sync/blocks.js';
import { MetaPortError, type FoundXattrs, type MetaPort } from '../../src/drive-sync/meta-port.js';

export function contentHasher(): BlockHasher {
  return {
    hash: async (path, bytes): Promise<HashedFile> => {
      const content = await readFile(path);
      if (content.length !== bytes) {
        throw new FileChangedWhileHashingError(path, bytes, content.length);
      }
      const size = blockSizeFor(bytes);
      const hashes: string[] = [];
      for (let at = 0; at < content.length; at += size) {
        hashes.push(
          createHash('sha256')
            .update(content.subarray(at, at + size))
            .digest('hex'),
        );
      }
      return { blockSize: size, hashes };
    },
    close: (): Promise<void> => Promise.resolve(),
  };
}

export function refusingHasher(): BlockHasher {
  return {
    hash: () => Promise.reject(new Error('the file must not be hashed again')),
    close: () => Promise.resolve(),
  };
}

export class MemoryXattrs implements MetaPort {
  readonly supported = true;
  readonly held = new Map<string, readonly SyncXattr[]>();
  readonly refuse = new Set<string>();

  xattrsOf(diskPaths: readonly string[]): Promise<FoundXattrs> {
    return Promise.resolve(new Map(diskPaths.map((path) => [path, this.held.get(path) ?? []])));
  }

  applyXattrs(diskPath: string, xattrs: readonly SyncXattr[]): Promise<void> {
    if (this.refuse.has(diskPath)) {
      return Promise.reject(new MetaPortError('ENOTSUP', 'no extended attributes here'));
    }
    this.held.set(diskPath, xattrs);
    return Promise.resolve();
  }

  setMtime(diskPath: string, mtimeNs: bigint): Promise<void> {
    const moment = new Date(Number(mtimeNs / 1_000_000n));
    return lutimes(diskPath, moment, moment);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
