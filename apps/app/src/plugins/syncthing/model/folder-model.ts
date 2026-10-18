import { formatBytes, type SyncthingFolder } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import type { StatusTone } from '../../../components/tone';
import { decimal } from '../../../format/number';
import { compareText, plural } from '../../../format/text';
import { percentOf } from './completion';

export interface FolderState {
  readonly tone: StatusTone;
  readonly glyph: IconName | null;
  readonly text: string;
  readonly percent: number;
}

const KIND_CHIP: Readonly<Partial<Record<SyncthingFolder['type'], string>>> = {
  sendonly: 'Send only',
  receiveonly: 'Receive only',
  receiveencrypted: 'Encrypted',
};

const KIND_SHEET: Readonly<Record<SyncthingFolder['type'], string>> = {
  sendreceive: 'Send and receive',
  sendonly: 'Send only',
  receiveonly: 'Receive only',
  receiveencrypted: 'Receive encrypted',
};

export function kindChip(folder: SyncthingFolder): string | null {
  return KIND_CHIP[folder.type] ?? null;
}

export function kindText(folder: SyncthingFolder): string {
  return KIND_SHEET[folder.type];
}

export function folderState(folder: SyncthingFolder): FolderState {
  const percent = percentOf(folder);
  if (folder.errorCount > 0) {
    return {
      tone: 'critical',
      glyph: 'warning',
      text: `${String(folder.errorCount)} failed`,
      percent,
    };
  }
  if (folder.paused) {
    return { tone: 'warning', glyph: 'pause', text: 'Paused', percent };
  }
  if (folder.localChanges > 0) {
    return {
      tone: 'info',
      glyph: 'pencil',
      text: plural(folder.localChanges, 'local change'),
      percent: 100,
    };
  }
  if (folder.needBytes > 0) {
    return {
      tone: 'info',
      glyph: null,
      text: `${decimal(percent)} % · ${formatBytes(folder.needBytes)} left`,
      percent,
    };
  }
  return { tone: 'positive', glyph: 'check', text: 'Up to date', percent: 100 };
}

function rank(folder: SyncthingFolder): number {
  if (folder.errorCount > 0) {
    return 0;
  }
  return folder.needBytes > 0 && !folder.paused ? 1 : 2;
}

export function orderedFolders(folders: readonly SyncthingFolder[]): readonly SyncthingFolder[] {
  return [...folders].sort(
    (left, right) => rank(left) - rank(right) || compareText(left.label, right.label),
  );
}
