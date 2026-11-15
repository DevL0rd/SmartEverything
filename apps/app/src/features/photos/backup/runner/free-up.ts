import { Logger } from '@smarteverything/logging';
import type { Ledger, LedgerEntry } from '../model/ledger';
import type { MediaScope } from '../model/types';
import { MEDIA_PAGE_ROWS, mediaScanCancelled } from './media-library';
import { saveLedger } from './ledger-store';
import type { BackupPorts } from './ports';

const log = new Logger('app.photos');

const EVERYTHING: MediaScope = { albumIds: [], includeVideos: true };

export const REMOVE_CHUNK = 1000;

export interface Freeable {
  readonly localIds: readonly string[];
  readonly bytes: number;
}

export type FreeableResult =
  { readonly kind: 'unsupported' } | ({ readonly kind: 'ready' } & Freeable);

async function currentTimes(
  ports: BackupPorts,
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, number>> {
  const times = new Map<string, number>();
  for await (const rows of ports.media.pagesFrom(EVERYTHING, 0, signal)) {
    if (mediaScanCancelled(signal)) break;
    for (const row of rows) times.set(row.id, row.modificationTime);
  }
  return times;
}

function supported(ports: BackupPorts, signal?: AbortSignal): boolean {
  return !mediaScanCancelled(signal) && ports.available() && ports.identity.platform === 'android';
}

function chunksOf<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let at = 0; at < items.length; at += size) chunks.push(items.slice(at, at + size));
  return chunks;
}

async function heldOf(
  ports: BackupPorts,
  entries: readonly LedgerEntry[],
  signal?: AbortSignal,
): Promise<LedgerEntry[]> {
  const verified = new Set<string>();
  for (const chunk of chunksOf(entries, MEDIA_PAGE_ROWS)) {
    if (mediaScanCancelled(signal)) return [];
    const answer = await ports.hub.lookupHashes({
      deviceId: ports.identity.deviceId,
      assets: chunk.map((entry) => ({ localId: entry.localId, sha256: entry.sha256 })),
    });
    for (const entry of answer.have) verified.add(entry.localId);
  }
  return entries.filter((entry) => verified.has(entry.localId));
}

function freeableOf(held: readonly LedgerEntry[]): Freeable {
  return {
    localIds: held.map((entry) => entry.localId),
    bytes: held.reduce((sum, entry) => sum + entry.bytes, 0),
  };
}

export async function findFreeable(
  ports: BackupPorts,
  ledger: Ledger,
  signal?: AbortSignal,
): Promise<FreeableResult> {
  if (!supported(ports, signal)) return { kind: 'unsupported' };
  const times = await currentTimes(ports, signal);
  if (mediaScanCancelled(signal)) return { kind: 'unsupported' };
  const unchanged = ledger
    .uploaded()
    .filter((entry) => times.get(entry.localId) === entry.modificationTime);
  return { kind: 'ready', ...freeableOf(await heldOf(ports, unchanged, signal)) };
}

async function stillFreeable(
  ports: BackupPorts,
  ledger: Ledger,
  confirmed: Freeable,
  signal?: AbortSignal,
): Promise<readonly string[]> {
  const wanted = new Set(confirmed.localIds);
  const entries = ledger.uploaded().filter((entry) => wanted.has(entry.localId));
  const times = new Map<string, number>();
  for (const chunk of chunksOf(entries, MEDIA_PAGE_ROWS)) {
    const found = await ports.media.modificationTimes(
      chunk.map((entry) => entry.localId),
      signal,
    );
    for (const [localId, time] of found) times.set(localId, time);
  }
  const unchanged = entries.filter((entry) => times.get(entry.localId) === entry.modificationTime);
  return (await heldOf(ports, unchanged, signal)).map((entry) => entry.localId);
}

export async function freeUp(
  ports: BackupPorts,
  ledger: Ledger,
  confirmed: Freeable,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!supported(ports, signal)) return false;
  const localIds = await stillFreeable(ports, ledger, confirmed, signal);
  if (localIds.length === 0 || !ports.available() || mediaScanCancelled(signal)) return false;
  let removedAny = false;
  for (const chunk of chunksOf(localIds, REMOVE_CHUNK)) {
    if (mediaScanCancelled(signal) || !(await ports.media.remove(chunk))) break;
    ledger.forget(chunk);
    removedAny = true;
  }
  log.info('backup.free_up_finished', { removed: removedAny, items: localIds.length });
  if (removedAny) await saveLedger(ports, ledger);
  return removedAny;
}
