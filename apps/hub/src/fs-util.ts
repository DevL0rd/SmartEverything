import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { z } from 'zod';

export function isMissing(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

export async function refreshJson<T>(
  file: string,
  schema: z.ZodType<T>,
  fetch: () => Promise<unknown>,
): Promise<T> {
  const parsed = schema.parse(await fetch());
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(parsed));
  return parsed;
}

export async function cachedJson<T>(
  file: string,
  schema: z.ZodType<T>,
  fetch: () => Promise<unknown>,
  unreadable: (cause: unknown) => void,
): Promise<T> {
  try {
    return schema.parse(JSON.parse(await readFile(file, 'utf8')));
  } catch (cause) {
    if (!isMissing(cause)) {
      unreadable(cause);
    }
    return refreshJson(file, schema, fetch);
  }
}
