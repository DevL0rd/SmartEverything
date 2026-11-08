import { closeSync, openSync, readFileSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readPackIndex,
  readPackModel,
  type LibraryEntry,
  type LibraryIndex,
  type LibraryModel,
} from '@smarteverything/tuya';

export const IR_LIBRARY_DIRECTORY = fileURLToPath(new URL('ir-library/', import.meta.url));

export class IrLibraryEntryUnknownError extends Error {
  override readonly name = 'IrLibraryEntryUnknownError';

  constructor(readonly libraryId: string) {
    super(`The infrared library has no model ${libraryId}.`);
  }
}

export interface Counted {
  readonly name: string;
  readonly models: number;
}

function counted(names: readonly string[]): Counted[] {
  const counts = new Map<string, number>();
  names.forEach((name) => {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });
  return [...counts]
    .map(([name, models]) => ({ name, models }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export class IrLibrary {
  private loaded: LibraryIndex | undefined;
  private readonly decoded = new Map<string, LibraryModel>();

  constructor(private readonly directory: string = IR_LIBRARY_DIRECTORY) {}

  categories(): Counted[] {
    return counted(this.index().entries.map((entry) => entry.category));
  }

  brands(category: string): Counted[] {
    return counted(
      this.index()
        .entries.filter((entry) => entry.category === category)
        .map((entry) => entry.brand),
    );
  }

  entries(category: string, brand: string): LibraryEntry[] {
    return this.index().entries.filter(
      (entry) => entry.category === category && entry.brand === brand,
    );
  }

  entry(libraryId: string): LibraryEntry {
    const entry = this.index().entries.find((candidate) => candidate.id === libraryId);
    if (entry === undefined) {
      throw new IrLibraryEntryUnknownError(libraryId);
    }
    return entry;
  }

  model(libraryId: string): LibraryModel {
    const known = this.decoded.get(libraryId);
    if (known !== undefined) {
      return known;
    }
    const entry = this.entry(libraryId);
    const model = readPackModel(entry, this.bytesOf(entry));
    this.decoded.set(libraryId, model);
    return model;
  }

  private index(): LibraryIndex {
    this.loaded ??= readPackIndex(readFileSync(join(this.directory, 'index.bin')));
    return this.loaded;
  }

  private bytesOf(entry: LibraryEntry): Buffer {
    const file = openSync(join(this.directory, 'models.bin'), 'r');
    try {
      const bytes = Buffer.alloc(entry.length);
      readSync(file, bytes, 0, entry.length, entry.offset);
      return bytes;
    } finally {
      closeSync(file);
    }
  }
}
