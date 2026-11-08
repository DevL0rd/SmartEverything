import { brotliCompressSync, brotliDecompressSync } from 'node:zlib';
import {
  LIBRARY_INDEX,
  LIBRARY_MODEL,
  type LibraryEntry,
  type LibraryIndex,
  type LibraryModel,
} from './library';

export interface PackedModel {
  readonly entry: Omit<LibraryEntry, 'offset' | 'length'>;
  readonly model: LibraryModel;
}

export interface Pack {
  readonly index: Buffer;
  readonly models: Buffer;
}

export class LibraryPackError extends Error {
  override readonly name = 'LibraryPackError';

  constructor(
    readonly what: string,
    readonly reason: string,
  ) {
    super(`The IR library pack ${what} is not usable: ${reason}.`);
  }
}

function compressed(value: unknown): Buffer {
  return brotliCompressSync(Buffer.from(JSON.stringify(value)));
}

export function buildPack(
  sources: readonly LibraryIndex['sources'][number][],
  packed: readonly PackedModel[],
): Pack {
  const blobs = packed.map(({ model }) => compressed(LIBRARY_MODEL.parse(model)));
  let offset = 0;
  const entries = packed.map(({ entry }, at): LibraryEntry => {
    const length = blobs[at]?.length ?? 0;
    const placed = { ...entry, offset, length };
    offset += length;
    return placed;
  });
  return {
    index: compressed(LIBRARY_INDEX.parse({ sources, entries })),
    models: Buffer.concat(blobs),
  };
}

export function readPackIndex(bytes: Uint8Array): LibraryIndex {
  return LIBRARY_INDEX.parse(JSON.parse(brotliDecompressSync(bytes).toString('utf8')));
}

export function readPackModel(entry: LibraryEntry, bytes: Uint8Array): LibraryModel {
  if (bytes.length !== entry.length) {
    throw new LibraryPackError(
      entry.id,
      `it holds ${String(bytes.length)} bytes, not ${String(entry.length)}`,
    );
  }
  return LIBRARY_MODEL.parse(JSON.parse(brotliDecompressSync(bytes).toString('utf8')));
}
