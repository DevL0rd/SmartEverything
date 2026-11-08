import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  APP_UPDATE_BROADCAST_INDEX_FILE,
  APP_UPDATE_ENTRY,
  APP_UPDATE_FILE,
  APP_UPDATE_INDEX,
  APP_UPDATE_TARGETED_INDEX_FILE,
  ApiError,
  type AppUpdateBlobStaged,
  type AppUpdateEntry,
  type AppUpdateIndex,
} from '@smarteverything/domain';
import type { HubLayout } from '../data-layout';
import { isMissing } from '../fs-util';
import { withAppUpdateLock } from './lock';

export const BLOB_FOLDER_NAME = 'blobs';

export class AppUpdateIndexError extends Error {
  override readonly name = 'AppUpdateIndexError';

  constructor(
    readonly file: string,
    reason: string,
  ) {
    super(`The update index ${file} cannot be used: ${reason}`);
  }
}

export function updateFolder(layout: HubLayout): string {
  return layout.system.updates.appUpdates;
}

export function indexFile(layout: HubLayout): string {
  return join(updateFolder(layout), APP_UPDATE_BROADCAST_INDEX_FILE);
}

export function targetedIndexFile(layout: HubLayout): string {
  return join(updateFolder(layout), APP_UPDATE_TARGETED_INDEX_FILE);
}

export function blobFolder(layout: HubLayout): string {
  return join(updateFolder(layout), BLOB_FOLDER_NAME);
}

export function blobFile(layout: HubLayout, sha256: string): string {
  return join(blobFolder(layout), APP_UPDATE_FILE.shape.sha256.parse(sha256));
}

export async function blobSize(layout: HubLayout, sha256: string): Promise<number | null> {
  try {
    return (await stat(blobFile(layout, sha256))).size;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export async function receiveBlob(
  layout: HubLayout,
  sha256: string,
  input: Readable,
): Promise<AppUpdateBlobStaged> {
  const target = blobFile(layout, sha256);
  await mkdir(blobFolder(layout), { recursive: true });
  const part = `${target}.${randomUUID()}.part`;
  const hash = createHash('sha256');
  let size = 0;
  try {
    await pipeline(
      input,
      async function* counted(source: AsyncIterable<Buffer>): AsyncGenerator<Buffer> {
        for await (const chunk of source) {
          hash.update(chunk);
          size += chunk.length;
          yield chunk;
        }
      },
      createWriteStream(part, { flags: 'wx', mode: 0o600 }),
    );
    if (hash.digest('hex') !== sha256) {
      throw new ApiError(
        'invalid_request',
        'The uploaded bytes do not match the sha256 in the path.',
      );
    }
    await rename(part, target);
    return { sha256, size };
  } finally {
    await rm(part, { force: true });
  }
}

async function textOf(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function readIndexFile(file: string, targeted: boolean): Promise<AppUpdateIndex> {
  const text = await textOf(file);
  if (text === null) return { entries: [] };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new AppUpdateIndexError(file, error instanceof Error ? error.message : 'not JSON');
  }
  const parsed = APP_UPDATE_INDEX.safeParse(json);
  if (!parsed.success) throw new AppUpdateIndexError(file, parsed.error.message);
  if (parsed.data.entries.some((entry) => (entry.clientId !== undefined) !== targeted)) {
    throw new AppUpdateIndexError(file, 'entries have the wrong device audience');
  }
  return parsed.data;
}

export async function readIndex(layout: HubLayout): Promise<AppUpdateIndex> {
  const [broadcast, targeted] = await Promise.all([
    readIndexFile(indexFile(layout), false),
    readIndexFile(targetedIndexFile(layout), true),
  ]);
  return { entries: [...broadcast.entries, ...targeted.entries] };
}

async function commitIndexFile(file: string, index: AppUpdateIndex): Promise<void> {
  const pending = `${file}.${randomUUID()}.next`;
  try {
    await writeFile(pending, `${JSON.stringify(index, null, 2)}\n`);
    await rename(pending, file);
  } finally {
    await rm(pending, { force: true });
  }
}

function entriesFor(index: AppUpdateIndex, targeted: boolean): AppUpdateIndex {
  return { entries: index.entries.filter((entry) => (entry.clientId !== undefined) === targeted) };
}

async function commitIndex(
  layout: HubLayout,
  before: AppUpdateIndex,
  index: AppUpdateIndex,
): Promise<void> {
  const checked = APP_UPDATE_INDEX.parse(index);
  await mkdir(updateFolder(layout), { recursive: true });
  for (const targeted of [false, true]) {
    const selected = entriesFor(checked, targeted);
    if (JSON.stringify(entriesFor(before, targeted)) === JSON.stringify(selected)) continue;
    const file = targeted ? targetedIndexFile(layout) : indexFile(layout);
    await commitIndexFile(file, selected);
  }
}

export function publishEntry(
  layout: HubLayout,
  prepare: (current: AppUpdateIndex) => Promise<AppUpdateEntry>,
): Promise<AppUpdateEntry> {
  return updateIndex(layout, async (current) => {
    const entry = APP_UPDATE_ENTRY.parse(await prepare(current));
    return { index: { entries: [...current.entries, entry] }, result: entry };
  });
}

export interface IndexChange<T> {
  readonly index: AppUpdateIndex;
  readonly result: T;
}

export function updateIndex<T>(
  layout: HubLayout,
  change: (current: AppUpdateIndex) => IndexChange<T> | Promise<IndexChange<T>>,
): Promise<T> {
  return withAppUpdateLock(layout.system.updates.appUpdatesLock, async () => {
    const before = await readIndex(layout);
    const { index, result } = await change(before);
    await commitIndex(layout, before, index);
    return result;
  });
}

export function referencedHashes(index: AppUpdateIndex): ReadonlySet<string> {
  const hashes = new Set<string>();
  for (const entry of index.entries) {
    if (entry.launch !== null) hashes.add(entry.launch.sha256);
    for (const file of entry.files) hashes.add(file.sha256);
  }
  return hashes;
}

async function pruneUnusedBlobs(layout: HubLayout): Promise<readonly string[]> {
  const referenced = referencedHashes(await readIndex(layout));
  const folder = blobFolder(layout);
  let names: readonly string[];
  try {
    names = await readdir(folder);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const unused = names.filter((name) => !referenced.has(name)).sort();
  await Promise.all(unused.map((name) => rm(join(folder, name))));
  return unused;
}

export function pruneBlobs(layout: HubLayout): Promise<readonly string[]> {
  return withAppUpdateLock(layout.system.updates.appUpdatesLock, () => pruneUnusedBlobs(layout));
}
