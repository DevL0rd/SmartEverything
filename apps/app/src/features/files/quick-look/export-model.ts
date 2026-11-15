import type { FileAbilities } from '../source/abilities';
import type { EntryNote, FileNode } from '../source/types';

export interface ExportState {
  readonly entry: EntryNote | null;
  readonly viewOnly: boolean;
  readonly mayOpen: boolean;
  readonly mayDownload: boolean;
  readonly selectable: boolean;
}

export function exportStateOf(
  node: Pick<FileNode, 'exportable' | 'kind' | 'entry'>,
  abilities: Pick<FileAbilities, 'download'>,
): ExportState {
  const { entry } = node;
  const viewOnly = entry === null && !node.exportable;
  const mayOpen = entry === null && !viewOnly;
  return {
    entry,
    viewOnly,
    mayOpen,
    mayDownload: mayOpen && abilities.download && node.kind !== 'folder',
    selectable: mayOpen,
  };
}

export function entryTextOf(entry: EntryNote): string {
  return `${entry.line}\n${entry.stays}`;
}

export const VIEW_ONLY_LABEL = 'View only';

export const VIEW_ONLY_LINE =
  'The owner made this view only. You can open it here, but not download, copy or sync it.';

export function lockedNoteOf(node: Pick<FileNode, 'exportable' | 'marks'>): string | null {
  if (!node.marks.locked || !node.exportable) return null;
  return 'View only for viewers: people with view access cannot download, copy or sync it.';
}
