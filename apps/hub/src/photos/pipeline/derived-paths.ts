import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { HubLayout } from '../../data-layout';
import { fsCode } from '../../fs-code';

export const DERIVED_SIZES = ['preview', 'thumb'] as const;

export type DerivedSize = (typeof DERIVED_SIZES)[number];

export const DERIVED_SIZE = z.enum(DERIVED_SIZES);

export const DERIVED_LONG_EDGE: Readonly<Record<DerivedSize, number>> = {
  preview: 2048,
  thumb: 360,
};

export const DERIVED_EXTENSION = 'webp';

export const DERIVED_MIME = 'image/webp';

export const DERIVED_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export type DerivedLayout = Pick<HubLayout, 'cache'>;

export interface DerivedKey {
  readonly itemId: string;
  readonly rev: number;
  readonly size: DerivedSize;
}

export function derivedDirectory(layout: DerivedLayout, itemId: string): string {
  return layout.cache.derived(itemId);
}

export function derivedPath(layout: DerivedLayout, key: DerivedKey): string {
  const rev = z.int().positive().parse(key.rev);
  return join(
    derivedDirectory(layout, key.itemId),
    `${key.itemId}-${String(rev)}-${DERIVED_SIZE.parse(key.size)}.${DERIVED_EXTENSION}`,
  );
}

export async function writeDerived(
  layout: DerivedLayout,
  key: DerivedKey,
  bytes: Uint8Array,
): Promise<string> {
  const target = derivedPath(layout, key);
  const staged = `${target}.${String(process.pid)}.partial`;
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(staged, bytes);
    await rename(staged, target);
  } catch (cause) {
    await rm(staged, { force: true });
    throw cause;
  }
  return target;
}

export async function pruneDerived(
  layout: DerivedLayout,
  itemId: string,
  keepRev: number,
): Promise<number> {
  const directory = derivedDirectory(layout, itemId);
  const prefix = `${itemId}-`;
  const keep = `${itemId}-${String(keepRev)}-`;
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (cause) {
    if (fsCode(cause) === 'ENOENT') return 0;
    throw cause;
  }
  const stale = names.filter((name) => name.startsWith(prefix) && !name.startsWith(keep));
  await Promise.all(stale.map((name) => rm(join(directory, name), { force: true })));
  return stale.length;
}
