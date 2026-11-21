import { open, readFile } from 'node:fs/promises';
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
  private loaded: Promise<LibraryIndex> | undefined;
  private readonly decoded = new Map<string, Promise<LibraryModel>>();

  constructor(private readonly directory: string = IR_LIBRARY_DIRECTORY) {}

  async categories(): Promise<Counted[]> {
    return counted((await this.index()).entries.map((entry) => entry.category));
  }

  async brands(category: string): Promise<Counted[]> {
    return counted(
      (await this.index()).entries
        .filter((entry) => entry.category === category)
        .map((entry) => entry.brand),
    );
  }

  async entries(category: string, brand: string): Promise<LibraryEntry[]> {
    return (await this.index()).entries.filter(
      (entry) => entry.category === category && entry.brand === brand,
    );
  }

  async entry(libraryId: string): Promise<LibraryEntry> {
    const entry = (await this.index()).entries.find((candidate) => candidate.id === libraryId);
    if (entry === undefined) {
      throw new IrLibraryEntryUnknownError(libraryId);
    }
    return entry;
  }

  model(libraryId: string): Promise<LibraryModel> {
    const known = this.decoded.get(libraryId);
    if (known !== undefined) {
      return known;
    }
    const decoding = this.decode(libraryId).catch((cause: unknown) => {
      this.decoded.delete(libraryId);
      throw cause;
    });
    this.decoded.set(libraryId, decoding);
    return decoding;
  }

  private async decode(libraryId: string): Promise<LibraryModel> {
    const entry = await this.entry(libraryId);
    return readPackModel(entry, await this.bytesOf(entry));
  }

  private index(): Promise<LibraryIndex> {
    if (this.loaded !== undefined) return this.loaded;
    const loading = readFile(join(this.directory, 'index.bin'))
      .then(readPackIndex)
      .catch((cause: unknown) => {
        this.loaded = undefined;
        throw cause;
      });
    this.loaded = loading;
    return loading;
  }

  private async bytesOf(entry: LibraryEntry): Promise<Buffer> {
    const file = await open(join(this.directory, 'models.bin'), 'r');
    try {
      const bytes = Buffer.alloc(entry.length);
      await file.read(bytes, 0, entry.length, entry.offset);
      return bytes;
    } finally {
      await file.close();
    }
  }
}
