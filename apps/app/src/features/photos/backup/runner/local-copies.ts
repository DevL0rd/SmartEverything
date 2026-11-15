import { Logger } from '@smarteverything/logging';
import type { Ledger } from '../model/ledger';
import { saveLedger } from './ledger-store';
import { loadLocalTrash, saveLocalTrash, type LocalTrashEntry } from './local-trash-store';
import type { BackupPorts, LocalTrashResult } from './ports';

const log = new Logger('app.photos');

export type LocalPlace = 'phone' | 'computer';

export type LocalCopyResult =
  | { readonly kind: 'none' }
  | {
      readonly kind: LocalTrashResult['outcome'];
      readonly asked: number;
      readonly changed: number;
      readonly place: LocalPlace;
    };

export function placeOf(ports: Pick<BackupPorts, 'identity'>): LocalPlace {
  return ports.identity.platform === 'desktop' ? 'computer' : 'phone';
}

function copiesOf(ledger: Ledger, itemIds: readonly string[]): readonly LocalTrashEntry[] {
  const wanted = new Set(itemIds);
  return ledger.uploaded().flatMap((entry) =>
    entry.itemId !== null && wanted.has(entry.itemId)
      ? [
          {
            itemId: entry.itemId,
            localId: entry.localId,
            modificationTime: entry.modificationTime,
          },
        ]
      : [],
  );
}

function resultOf(ports: BackupPorts, asked: number, answer: LocalTrashResult): LocalCopyResult {
  return {
    kind: answer.outcome,
    asked,
    changed: answer.localIds.length,
    place: placeOf(ports),
  };
}

export async function trashLocalCopies(
  ports: BackupPorts,
  ledger: Ledger,
  itemIds: readonly string[],
): Promise<LocalCopyResult> {
  const copies = copiesOf(ledger, itemIds);
  if (copies.length === 0) return { kind: 'none' };
  const answer = await ports.trash.trash(copies.map((entry) => entry.localId));
  const moved = new Set(answer.localIds);
  const trashed = copies.filter((entry) => moved.has(entry.localId));
  if (trashed.length > 0) {
    const kept = (await loadLocalTrash(ports.storage)).filter((entry) => !moved.has(entry.localId));
    await saveLocalTrash(ports.storage, [...kept, ...trashed]);
    ledger.forget(moved);
    await saveLedger(ports, ledger);
  }
  log.info('backup.local_copies_trashed', {
    outcome: answer.outcome,
    asked: copies.length,
    trashed: trashed.length,
  });
  return resultOf(ports, copies.length, answer);
}

export async function restoreLocalCopies(
  ports: BackupPorts,
  itemIds: readonly string[],
): Promise<LocalCopyResult> {
  const wanted = new Set(itemIds);
  const entries = await loadLocalTrash(ports.storage);
  const restoring = entries.filter((entry) => wanted.has(entry.itemId));
  if (restoring.length === 0) return { kind: 'none' };
  const answer = await ports.trash.untrash(restoring.map((entry) => entry.localId));
  if (answer.outcome !== 'declined')
    await saveLocalTrash(
      ports.storage,
      entries.filter((entry) => !wanted.has(entry.itemId)),
    );
  log.info('backup.local_copies_restored', {
    outcome: answer.outcome,
    asked: restoring.length,
    restored: answer.localIds.length,
  });
  return resultOf(ports, restoring.length, answer);
}
