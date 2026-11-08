import { Logger } from '@smarteverything/logging';
import type { Ledger } from '../model/ledger';
import type { MediaScope } from '../model/types';
import { mediaScanCancelled } from './media-library';
import { saveLedger } from './ledger-store';
import type { BackupPorts } from './ports';

const log = new Logger('app.photos');

const EVERYTHING: MediaScope = { albumIds: [], includeVideos: true };

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

export async function findFreeable(
  ports: BackupPorts,
  ledger: Ledger,
  signal?: AbortSignal,
): Promise<FreeableResult> {
  if (mediaScanCancelled(signal) || !ports.available() || ports.identity.platform !== 'android')
    return { kind: 'unsupported' };
  const times = await currentTimes(ports, signal);
  if (mediaScanCancelled(signal)) return { kind: 'unsupported' };
  const unchanged = ledger
    .uploaded()
    .filter((entry) => times.get(entry.localId) === entry.modificationTime);
  if (unchanged.length === 0) return { kind: 'ready', localIds: [], bytes: 0 };
  const answer = await ports.hub.checkHashes(
    {
      deviceId: ports.identity.deviceId,
      assets: unchanged.map((entry) => ({ localId: entry.localId, sha256: entry.sha256 })),
    },
    'lookup',
  );
  const verified = new Set(answer.have.map((entry) => entry.localId));
  const held = unchanged.filter((entry) => verified.has(entry.localId));
  return {
    kind: 'ready',
    localIds: held.map((entry) => entry.localId),
    bytes: held.reduce((sum, entry) => sum + entry.bytes, 0),
  };
}

export async function freeUp(
  ports: BackupPorts,
  ledger: Ledger,
  confirmed: Freeable,
  signal?: AbortSignal,
): Promise<boolean> {
  const current = await findFreeable(ports, ledger, signal);
  if (current.kind !== 'ready') return false;
  const allowed = new Set(current.localIds);
  const localIds = confirmed.localIds.filter((localId) => allowed.has(localId));
  if (localIds.length === 0 || !ports.available() || mediaScanCancelled(signal)) return false;
  const removed = await ports.media.remove(localIds);
  log.info('backup.free_up_finished', { removed, items: localIds.length });
  if (removed) {
    ledger.forget(localIds);
    await saveLedger(ports.storage, ledger);
  }
  return removed;
}
