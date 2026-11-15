import { plural } from '../../../format/text';
import { REFUSAL_TEXT, placeRefusal, type DropTarget } from '../browser/drag-model';
import type { PickerHere } from '../picker/picker-model';
import { opAllowed, type FileOp } from '../source/ops';
import type { FileLocation, FileNode } from '../source/types';

export type TransferMode = 'move' | 'copy';

export function transferTargetOf(sourceId: string, here: PickerHere): DropTarget {
  const { crumbs } = here.listing;
  return {
    sourceId,
    location: here.location,
    key: crumbs.at(-1)?.key ?? here.location.folder,
    ancestors: crumbs.slice(0, -1).map((crumb) => crumb.key),
    writable: here.writable,
  };
}

export function transferOpOf<O>(
  mode: TransferMode,
  nodes: readonly FileNode<O>[],
  to: FileLocation,
): FileOp<O> {
  return { kind: mode, nodes, to };
}

export function transferRefusalOf<O>(
  sourceId: string,
  mode: TransferMode,
  nodes: readonly FileNode<O>[],
  here: PickerHere<O>,
): string | null {
  const refusal = placeRefusal({ sourceId, nodes }, transferTargetOf(sourceId, here));
  if (refusal !== null && !(mode === 'copy' && refusal === 'already_here')) {
    return REFUSAL_TEXT[refusal];
  }
  return opAllowed(transferOpOf(mode, nodes, here.location), here.abilities)
    ? null
    : REFUSAL_TEXT.not_allowed;
}

export function transferTitleOf(mode: TransferMode, nodes: readonly FileNode[]): string {
  const [only] = nodes;
  const what = nodes.length === 1 && only !== undefined ? only.name : plural(nodes.length, 'item');
  return `${mode === 'move' ? 'Move' : 'Copy'} ${what}`;
}
