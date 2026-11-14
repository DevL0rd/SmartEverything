import type { UploadFailure, UploadOutcome } from '../../../drive';
import { takenAtOf, identityOf } from '../model/plan';
import type { MediaRow, MediaStat } from '../model/types';
import type { BackupPorts } from './ports';

export interface HashedItem {
  readonly row: MediaRow;
  readonly stat: MediaStat;
  readonly sha256: string;
}

export type ItemEnd =
  | { readonly kind: 'uploaded'; readonly itemId: string }
  | { readonly kind: 'interrupted' }
  | { readonly kind: 'failed'; readonly failure: string; readonly fatal: boolean };

const FATAL_FAILURES: ReadonlySet<UploadFailure['kind']> = new Set([
  'over-quota',
  'no-space',
  'read-only-root',
  'session-refused',
  'hub-unreachable',
]);

function failureOf(outcome: Exclude<UploadOutcome, { kind: 'done' | 'already-have' }>): ItemEnd {
  if (outcome.kind === 'cancelled') {
    return { kind: 'failed', failure: 'cancelled', fatal: false };
  }
  return {
    kind: 'failed',
    failure: outcome.failure.kind,
    fatal: FATAL_FAILURES.has(outcome.failure.kind),
  };
}

export async function uploadItem(
  ports: BackupPorts,
  item: HashedItem,
  aborted: Promise<'aborted'>,
  signal?: AbortSignal,
): Promise<ItemEnd> {
  const { row, stat, sha256 } = item;
  const target = await ports.hub.resolveTarget(ports.identity.deviceId, takenAtOf(row));
  if (signal?.aborted === true) return { kind: 'interrupted' };
  const handle = ports.upload.start({
    identity: identityOf(row),
    uri: row.id,
    bytes: stat.bytes,
    name: row.filename,
    mimeType: stat.mimeType,
    folderId: target.folderId,
    sha256,
  });
  const winner = await Promise.race([handle.outcome, aborted]);
  if (winner === 'aborted') {
    await handle.pause();
    return { kind: 'interrupted' };
  }
  if (winner.kind === 'done' || winner.kind === 'already-have') {
    return { kind: 'uploaded', itemId: winner.itemId };
  }
  return failureOf(winner);
}
