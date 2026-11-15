import { plural } from '../../../format/text';
import type { FileAbilities } from '../source/abilities';
import { nodeAllows, type FileOp } from '../source/ops';
import type { FileLocation, FileNode } from '../source/types';

export interface DragPayload<O = unknown> {
  readonly sourceId: string;
  readonly nodes: readonly FileNode<O>[];
}

export interface DropTarget {
  readonly sourceId: string;
  readonly location: FileLocation;
  readonly key: string | null;
  readonly ancestors: readonly string[];
  readonly writable: boolean;
}

export type DropRefusal =
  | 'nothing'
  | 'other_source'
  | 'into_itself'
  | 'into_child'
  | 'already_here'
  | 'not_writable'
  | 'not_allowed';

export type DropVerdict<O = unknown> =
  | { readonly kind: 'move' | 'copy'; readonly op: FileOp<O> }
  | { readonly kind: 'refused'; readonly reason: DropRefusal };

export const REFUSAL_TEXT: Readonly<Record<DropRefusal, string>> = {
  nothing: 'Nothing is being dragged.',
  other_source: 'Items can only be moved within the same place.',
  into_itself: 'A folder can’t be moved into itself.',
  into_child: 'A folder can’t be moved into one of its own folders.',
  already_here: 'These items are already in this folder.',
  not_writable: 'You can only view this folder, so nothing can be moved here.',
  not_allowed: 'These items can’t be moved.',
};

function refused<O>(reason: DropRefusal): DropVerdict<O> {
  return { kind: 'refused', reason };
}

export function placeRefusal<O>(payload: DragPayload<O>, target: DropTarget): DropRefusal | null {
  if (payload.nodes.length === 0) return 'nothing';
  if (payload.sourceId !== target.sourceId) return 'other_source';
  const keys = new Set(payload.nodes.map((node) => node.key));
  if (target.key !== null && keys.has(target.key)) return 'into_itself';
  if (target.ancestors.some((key) => keys.has(key))) return 'into_child';
  if (payload.nodes.every((node) => node.parentKey === target.key)) return 'already_here';
  return target.writable ? null : 'not_writable';
}

export function dropVerdictOf<O>(
  payload: DragPayload<O>,
  target: DropTarget,
  abilities: FileAbilities,
  copy: boolean,
): DropVerdict<O> {
  const refusal = placeRefusal(payload, target);
  if (refusal !== null && !(copy && refusal === 'already_here')) return refused(refusal);
  const kind = copy ? 'copy' : 'move';
  const allowed = copy ? abilities.copy : abilities.move && abilities.dragMove;
  if (!allowed || !payload.nodes.every((node) => nodeAllows(kind, node))) {
    return refused('not_allowed');
  }
  return { kind, op: { kind, nodes: payload.nodes, to: target.location } };
}

export function dropLabelOf<O>(verdict: DropVerdict<O>, folder: string): string {
  if (verdict.kind === 'refused') return REFUSAL_TEXT[verdict.reason];
  const verb = verdict.kind === 'copy' ? 'Copy' : 'Move';
  const op = verdict.op;
  const many = op.kind === 'move' || op.kind === 'copy' ? op.nodes.length : 0;
  return `${verb} ${plural(many, 'item')} to ${folder}`;
}

export type UploadDropVerdict =
  | { readonly kind: 'upload'; readonly to: FileLocation }
  | { readonly kind: 'refused'; readonly reason: 'not_writable' | 'not_allowed' };

export function uploadDropOf(target: DropTarget, abilities: FileAbilities): UploadDropVerdict {
  if (!abilities.upload) return { kind: 'refused', reason: 'not_allowed' };
  if (!target.writable) return { kind: 'refused', reason: 'not_writable' };
  return { kind: 'upload', to: target.location };
}
