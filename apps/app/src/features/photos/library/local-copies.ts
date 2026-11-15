import { Logger } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
import { count } from '../../../format/number';
import { backupHandle } from '../backup/handle';
import type { LocalCopyResult, LocalPlace } from '../backup/runner/local-copies';

const log = new Logger('app.photos');

export type LocalCopyChange = 'trash' | 'restore';

export type LocalCopies = Readonly<
  Record<LocalCopyChange, (itemIds: readonly string[]) => Promise<LocalCopyResult>>
>;

const NONE: LocalCopyResult = { kind: 'none' };

function withRunner(change: LocalCopyChange, itemIds: readonly string[]): Promise<LocalCopyResult> {
  const handle = backupHandle.get();
  if (handle === null) {
    log.info('photos.local_copies_without_backup', { change, items: itemIds.length });
    return Promise.resolve(NONE);
  }
  return change === 'trash'
    ? handle.runner.trashLocalCopies(itemIds)
    : handle.runner.restoreLocalCopies(itemIds);
}

export const LIVE_LOCAL_COPIES: LocalCopies = {
  trash: (itemIds) => withRunner('trash', itemIds),
  restore: (itemIds) => withRunner('restore', itemIds),
};

function copiesText(total: number, place: LocalPlace): string {
  return total === 1 ? `The copy on this ${place}` : `The ${count(total)} copies on this ${place}`;
}

function trashLine(result: Exclude<LocalCopyResult, { kind: 'none' }>): string | null {
  const one = result.asked === 1;
  switch (result.kind) {
    case 'done':
      return result.changed === 0
        ? null
        : `${copiesText(result.changed, result.place)} moved to its trash too.`;
    case 'declined':
      return `${copiesText(result.asked, result.place)} ${one ? 'was' : 'were'} kept.`;
    case 'unsupported':
      return `This ${result.place} has no trash, so ${one ? 'its copy was' : 'its copies were'} kept.`;
  }
}

function restoredLine(result: Exclude<LocalCopyResult, { kind: 'none' }>): string {
  const one = result.asked === 1;
  const copies = copiesText(result.asked, result.place);
  if (result.changed === result.asked) return `${copies} ${one ? 'is' : 'are'} back too.`;
  if (result.changed > 0)
    return `${count(result.changed)} of the ${count(result.asked)} copies on this ${result.place} are back. The others had already left its trash.`;
  return `${copies} had already left its trash, so ${one ? 'it is' : 'they are'} only on the hub.`;
}

function restoreLine(result: Exclude<LocalCopyResult, { kind: 'none' }>): string {
  const one = result.asked === 1;
  const copies = copiesText(result.asked, result.place);
  switch (result.kind) {
    case 'done':
      return restoredLine(result);
    case 'declined':
      return `${copies} ${one ? 'stays' : 'stay'} in its trash.`;
    case 'unsupported':
      return `${copies} ${one ? 'stays' : 'stay'} in its trash. Restore ${one ? 'it' : 'them'} from there.`;
  }
}

export function localCopyLine(result: LocalCopyResult, change: LocalCopyChange): string | null {
  if (result.kind === 'none') return null;
  return change === 'trash' ? trashLine(result) : restoreLine(result);
}

export async function changeLocalCopies(
  change: LocalCopyChange,
  itemIds: readonly string[],
  local: LocalCopies,
): Promise<string | null> {
  try {
    return localCopyLine(await local[change](itemIds), change);
  } catch (error) {
    log.warn('photos.local_copies_failed', { change, items: itemIds.length });
    notify({
      message:
        change === 'trash'
          ? 'The copies on this device were not moved to its trash'
          : 'The copies on this device were not restored',
      error,
      tone: 'critical',
    });
    return null;
  }
}

export async function restoreLocalCopiesWithNotice(
  itemIds: readonly string[],
  local: LocalCopies = LIVE_LOCAL_COPIES,
): Promise<void> {
  const line = await changeLocalCopies('restore', itemIds, local);
  if (line !== null) notify({ message: line });
}
