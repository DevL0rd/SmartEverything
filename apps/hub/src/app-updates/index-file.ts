import { readFile, stat } from 'node:fs/promises';
import type { z } from 'zod';
import { isMissing } from '../fs-util';

export class AppUpdateIndexInvalidError extends Error {
  override readonly name = 'AppUpdateIndexInvalidError';

  constructor(
    readonly file: string,
    expected: string,
    received: string,
  ) {
    super(`${file} must hold ${expected}; received ${received}`);
  }
}

type Snapshot<T> = { readonly value: T } | { readonly failure: unknown };

export class Loaded<T> {
  private snapshot: Promise<Snapshot<T>> | null = null;

  constructor(private readonly read: () => Promise<T>) {}

  async get(): Promise<T> {
    this.snapshot ??= this.load();
    return this.unwrap(await this.snapshot);
  }

  async refresh(): Promise<T> {
    this.snapshot = this.load();
    return this.unwrap(await this.snapshot);
  }

  private async load(): Promise<Snapshot<T>> {
    try {
      return { value: await this.read() };
    } catch (failure) {
      return { failure };
    }
  }

  private unwrap(snapshot: Snapshot<T>): T {
    if ('failure' in snapshot) throw snapshot.failure;
    return snapshot.value;
  }
}

function jsonOf(file: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new AppUpdateIndexInvalidError(file, 'JSON', String(cause));
  }
}

export async function readIndexFile<T>(
  file: string,
  schema: z.ZodType<T>,
  expected: string,
): Promise<T | null> {
  const text = await readFile(file, 'utf8').catch((cause: unknown) => {
    if (isMissing(cause)) return null;
    throw cause;
  });
  if (text === null) return null;
  const result = schema.safeParse(jsonOf(file, text));
  if (!result.success) throw new AppUpdateIndexInvalidError(file, expected, result.error.message);
  return result.data;
}

export async function verifyStoredFile(
  path: string,
  expected: string,
  size: number,
): Promise<void> {
  const found = await stat(path).catch((cause: unknown) => {
    if (isMissing(cause)) throw new AppUpdateIndexInvalidError(path, expected, 'no file');
    throw cause;
  });
  if (found.size !== size) {
    throw new AppUpdateIndexInvalidError(
      path,
      `${String(size)} bytes as the index says`,
      `${String(found.size)} bytes`,
    );
  }
}
