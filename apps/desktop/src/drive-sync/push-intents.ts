import type { DirtyBatch } from './dirty.js';
import type { FileRecord } from './db/index.js';

export type PushIntent =
  | { readonly kind: 'push'; readonly record: FileRecord }
  | { readonly kind: 'meta'; readonly record: FileRecord }
  | { readonly kind: 'link'; readonly record: FileRecord }
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
  if (record.kind === 'link') return [{ kind: 'link', record }];
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

function createdIntents(
  rename: DirtyBatch['renames'][number],
  target: FileRecord | undefined,
  after: FileView,
): readonly PushIntent[] {
  const created = rename.kind === 'folder' ? after.under(rename.to) : [target];
  return created.flatMap((record) => pushIntentOf(record, record?.relPath ?? rename.to));
}

function afterMoveIntents(
  source: FileRecord,
  target: FileRecord | undefined,
  to: string,
): readonly PushIntent[] {
  if (target?.kind === 'file' && !sameContent(source, target)) return pushIntentOf(target, to);
  return target?.metaDirty === true && target.kind !== 'link'
    ? [{ kind: 'meta', record: target }]
    : [];
}

function renameIntents(
  rename: DirtyBatch['renames'][number],
  before: FileView,
  after: FileView,
): readonly PushIntent[] {
  const source = before.get(rename.from);
  const target = after.get(rename.to);
  const baseRev = source?.hubRev ?? null;
  if (source === undefined || baseRev === null) return createdIntents(rename, target, after);
  const move: PushIntent = { kind: 'move', from: rename.from, to: rename.to, baseRev };
  return [move, ...afterMoveIntents(source, target, rename.to)];
}

function tombstoneOf(record: FileRecord | undefined): readonly PushIntent[] {
  const baseRev = record?.hubRev ?? null;
  return record === undefined || baseRev === null
    ? []
    : [{ kind: 'tombstone', relPath: record.relPath, baseRev }];
}

function knownOf(prior: FileRecord | undefined): FileRecord | undefined {
  return prior?.hubRev === null ? undefined : prior;
}

function replacesLink(prior: FileRecord | undefined, next: FileRecord): prior is FileRecord {
  if (prior === undefined) return false;
  return prior.kind !== next.kind && (prior.kind === 'link' || next.kind === 'link');
}

function linkChange(known: FileRecord | undefined, next: FileRecord): readonly PushIntent[] {
  if (known === undefined) return pushIntentOf(next, next.relPath);
  return known.linkTarget === next.linkTarget
    ? []
    : [...tombstoneOf(known), ...pushIntentOf(next, next.relPath)];
}

function fileChange(known: FileRecord | undefined, next: FileRecord): readonly PushIntent[] {
  return known?.kind === 'file' && sameContent(known, next)
    ? [{ kind: 'meta', record: next }]
    : pushIntentOf(next, next.relPath);
}

function changeIntents(relPath: string, before: FileView, after: FileView): readonly PushIntent[] {
  const next = after.get(relPath);
  const prior = before.get(relPath);
  if (next === undefined) return [];
  if (replacesLink(prior, next)) return [...tombstoneOf(prior), ...pushIntentOf(next, relPath)];
  const known = knownOf(prior);
  if (next.kind === 'link') return linkChange(known, next);
  if (next.kind === 'folder') {
    return known?.kind === 'folder' ? [{ kind: 'meta', record: next }] : [];
  }
  return fileChange(known, next);
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
    ...batch.changed.flatMap((relPath) => changeIntents(relPath, before, after)),
  ];
}

export function fileViewOf(records: readonly FileRecord[]): FileView {
  const byPath = new Map(records.map((record) => [record.relPath, record]));
  return {
    get: (relPath) => byPath.get(relPath),
    under: (relPath) => records.filter((record) => record.relPath.startsWith(`${relPath}/`)),
  };
}
