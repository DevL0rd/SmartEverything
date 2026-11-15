import type { PhotoCopyKeptReason } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { backupOriginOf } from '../../local/folders';
import type { Ledger, LedgerEntry } from '../model/ledger';
import { saveLedger } from './ledger-store';
import { MEDIA_PAGE_ROWS } from './media-library';
import type { BackupPorts } from './ports';

const log = new Logger('app.photos');

export interface FolderCopy {
  readonly itemId: string;
  readonly bytes: number;
  readonly localIds: readonly string[];
}

export interface FolderCopies {
  readonly items: readonly FolderCopy[];
  readonly kept: ReadonlyMap<string, PhotoCopyKeptReason>;
}

function chunksOf<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let at = 0; at < items.length; at += size) chunks.push(items.slice(at, at + size));
  return chunks;
}

class Collected {
  readonly items = new Map<string, { bytes: number; localIds: Set<string> }>();
  readonly kept = new Map<string, PhotoCopyKeptReason>();

  add(answer: Awaited<ReturnType<BackupPorts['hub']['folderCopies']>>): void {
    for (const entry of answer.kept) this.kept.set(entry.itemId, entry.reason);
    for (const item of answer.items) {
      const known = this.items.get(item.itemId) ?? { bytes: item.bytes, localIds: new Set() };
      for (const localId of item.localIds) known.localIds.add(localId);
      this.items.set(item.itemId, known);
    }
  }

  result(): FolderCopies {
    return {
      items: [...this.items]
        .filter(([itemId]) => !this.kept.has(itemId))
        .map(([itemId, item]) => ({ itemId, bytes: item.bytes, localIds: [...item.localIds] })),
      kept: this.kept,
    };
  }
}

async function folderEntries(
  ports: BackupPorts,
  ledger: Ledger,
  backupId: string,
): Promise<readonly LedgerEntry[]> {
  const present = await ports.media.listIds({ albumIds: [backupId], includeVideos: true });
  return ledger.uploaded().filter((entry) => present.has(entry.localId));
}

async function folderKeyOf(ports: BackupPorts, localId: string): Promise<string | null> {
  const [stat] = await ports.native.statMedia([localId]);
  if (stat === undefined) return null;
  const origin = backupOriginOf(ports.identity.platform, stat.relativePath);
  return origin === null ? null : origin.key;
}

async function collectFolder(
  ports: BackupPorts,
  entries: readonly LedgerEntry[],
  collected: Collected,
): Promise<void> {
  const first = entries[0];
  if (first === undefined) return;
  const folderKey = await folderKeyOf(ports, first.localId);
  if (folderKey === null) {
    log.warn('backup.folder_copies_without_folder', { entries: entries.length });
    return;
  }
  for (const chunk of chunksOf(entries, MEDIA_PAGE_ROWS)) {
    collected.add(
      await ports.hub.folderCopies({
        deviceId: ports.identity.deviceId,
        folderKey,
        localIds: chunk.map((entry) => entry.localId),
      }),
    );
  }
}

export async function findFolderCopies(
  ports: BackupPorts,
  ledger: Ledger,
  backupIds: readonly string[],
): Promise<FolderCopies> {
  const collected = new Collected();
  for (const backupId of backupIds)
    await collectFolder(ports, await folderEntries(ports, ledger, backupId), collected);
  const result = collected.result();
  log.info('backup.folder_copies_found', {
    folders: backupIds.length,
    items: result.items.length,
    kept: result.kept.size,
  });
  return result;
}

export async function forgetFolderCopies(
  ports: BackupPorts,
  ledger: Ledger,
  localIds: readonly string[],
): Promise<void> {
  ledger.forget(localIds);
  await saveLedger(ports, ledger);
}
