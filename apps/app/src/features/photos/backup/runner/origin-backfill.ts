import type { BackupCheck } from '@smarteverything/domain';
import { backupOriginOf } from '../../local/folders';
import type { Ledger, LedgerEntry } from '../model/ledger';
import type { BackupPorts } from './ports';

const CHUNK = 200;

function chunksOf<T>(items: readonly T[]): T[][] {
  const chunks: T[][] = [];
  for (let at = 0; at < items.length; at += CHUNK) chunks.push(items.slice(at, at + CHUNK));
  return chunks;
}

async function lacking(
  ports: BackupPorts,
  chunk: readonly LedgerEntry[],
): Promise<readonly LedgerEntry[]> {
  const itemIds = [
    ...new Set(chunk.flatMap((entry) => (entry.itemId === null ? [] : [entry.itemId]))),
  ];
  const answer = await ports.hub.origins({ deviceId: ports.identity.deviceId, itemIds });
  const known = new Set(
    answer.origins.filter((origin) => origin.folder !== null).map((origin) => origin.itemId),
  );
  return chunk.filter((entry) => entry.itemId !== null && !known.has(entry.itemId));
}

export async function reportMissingOrigins(
  ports: BackupPorts,
  ledger: Ledger,
  present: ReadonlySet<string>,
  signal: AbortSignal,
): Promise<void> {
  const stopped = (): boolean => signal.aborted;
  const entries = ledger
    .uploaded()
    .filter((entry) => entry.itemId !== null && present.has(entry.localId));
  for (const chunk of chunksOf(entries)) {
    if (stopped()) return;
    const missing = await lacking(ports, chunk);
    if (missing.length === 0 || stopped()) continue;
    const stats = await ports.native.statMedia(
      missing.map((entry) => entry.localId),
      signal,
    );
    const hashes = new Map(missing.map((entry) => [entry.localId, entry.sha256]));
    const assets: BackupCheck['assets'][number][] = [];
    for (const stat of stats) {
      const folder = backupOriginOf(ports.identity.platform, stat.relativePath);
      const sha256 = hashes.get(stat.id);
      if (folder !== null && sha256 !== undefined)
        assets.push({ localId: stat.id, sha256, folder });
    }
    if (assets.length === 0 || stopped()) continue;
    await ports.hub.checkBackup({ deviceId: ports.identity.deviceId, assets });
  }
}
