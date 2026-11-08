import type { DirtyBatch } from './dirty.js';
import type { FileRecord } from './db/index.js';

export type PushIntent =
  | { readonly kind: 'push'; readonly record: FileRecord }
  | { readonly kind: 'move'; readonly from: string; readonly to: string; readonly baseRev: number }
  | { readonly kind: 'tombstone'; readonly relPath: string; readonly baseRev: number };

export interface FileView {
  readonly get: (relPath: string) => FileRecord | undefined;
  readonly under: (relPath: string) => readonly FileRecord[];
}

export class PushNotReadyError extends Error {
  constructor(readonly relPath: string) {
    super(`${relPath} has no hashed record to push`);
    this.name = 'PushNotReadyError';
  }
}

export type HashedFile = FileRecord & { readonly blocks: Uint8Array; readonly blockSize: number };

export function isHashedFile(record: FileRecord | undefined): record is HashedFile {
  return (
    record?.kind === 'file' &&
    record.localHashState === 'hashed' &&
    record.blocks !== null &&
    record.blockSize !== null
  );
}

export function pushIntentOf(
  record: FileRecord | undefined,
  relPath: string,
): readonly PushIntent[] {
  if (record === undefined || record.kind === 'folder') return [];
  if (!isHashedFile(record)) throw new PushNotReadyError(relPath);
  return [{ kind: 'push', record }];
}

function sameContent(first: FileRecord, second: FileRecord): boolean {
  return (
    first.bytes === second.bytes &&
    first.blocks !== null &&
    second.blocks !== null &&
    Buffer.compare(first.blocks, second.blocks) === 0
  );
}

function renameIntents(
  rename: DirtyBatch['renames'][number],
  before: FileView,
  after: FileView,
): readonly PushIntent[] {
  const source = before.get(rename.from);
  const target = after.get(rename.to);
  const baseRev = source?.hubRev ?? null;
  if (source === undefined || baseRev === null) {
    const created = rename.kind === 'folder' ? after.under(rename.to) : [target];
    return created.flatMap((record) => pushIntentOf(record, record?.relPath ?? rename.to));
  }
  const move: PushIntent = { kind: 'move', from: rename.from, to: rename.to, baseRev };
  const edited = target?.kind === 'file' && !sameContent(source, target);
  return edited ? [move, ...pushIntentOf(target, rename.to)] : [move];
}

function deleteIntents(relPath: string, before: FileView): readonly PushIntent[] {
  const record = before.get(relPath);
  if (record === undefined) return [];
  const doomed = [...before.under(relPath)]
    .sort((first, second) => second.relPath.length - first.relPath.length)
    .concat(record);
  return doomed.flatMap((entry) =>
    entry.hubRev === null
      ? []
      : [{ kind: 'tombstone', relPath: entry.relPath, baseRev: entry.hubRev } as const],
  );
}

export function pushIntents(
  batch: DirtyBatch,
  before: FileView,
  after: FileView,
): readonly PushIntent[] {
  return [
    ...batch.renames.flatMap((rename) => renameIntents(rename, before, after)),
    ...batch.deleted.flatMap((relPath) => deleteIntents(relPath, before)),
    ...batch.changed.flatMap((relPath) => pushIntentOf(after.get(relPath), relPath)),
  ];
}

export function fileViewOf(records: readonly FileRecord[]): FileView {
  const byPath = new Map(records.map((record) => [record.relPath, record]));
  return {
    get: (relPath) => byPath.get(relPath),
    under: (relPath) => records.filter((record) => record.relPath.startsWith(`${relPath}/`)),
  };
}
