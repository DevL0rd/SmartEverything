import { plural } from '../../../format/text';
import type { FileAbilities, FlagAbility } from './abilities';
import { locationKeyOf, type FileLocation, type FileNode } from './types';

export type FileOp<O = unknown> =
  | { readonly kind: 'new_folder'; readonly in: FileLocation; readonly name: string }
  | { readonly kind: 'rename'; readonly node: FileNode<O>; readonly name: string }
  | { readonly kind: 'move'; readonly nodes: readonly FileNode<O>[]; readonly to: FileLocation }
  | { readonly kind: 'copy'; readonly nodes: readonly FileNode<O>[]; readonly to: FileLocation }
  | { readonly kind: 'trash'; readonly nodes: readonly FileNode<O>[] }
  | { readonly kind: 'restore'; readonly nodes: readonly FileNode<O>[] }
  | { readonly kind: 'delete_now'; readonly nodes: readonly FileNode<O>[] }
  | { readonly kind: 'star'; readonly nodes: readonly FileNode<O>[] }
  | { readonly kind: 'unstar'; readonly nodes: readonly FileNode<O>[] };

export type OpKind = FileOp['kind'];

export interface OpFailure {
  readonly key: string;
  readonly reason: string;
}

export interface OpFollowAction {
  readonly label: string;
  readonly onPress: () => void;
}

export interface OpFollow {
  readonly message: string;
  readonly action: OpFollowAction | null;
}

export interface OpResult {
  readonly done: readonly string[];
  readonly failed: readonly OpFailure[];
  readonly undo: (() => Promise<OpResult>) | null;
  readonly follow?: OpFollow;
}

export const NOTHING_DONE: OpResult = { done: [], failed: [], undo: null };

export const OP_ABILITY: Readonly<Record<OpKind, FlagAbility>> = {
  new_folder: 'newFolder',
  rename: 'rename',
  move: 'move',
  copy: 'copy',
  trash: 'trash',
  restore: 'restore',
  delete_now: 'deleteNow',
  star: 'star',
  unstar: 'star',
};

const NEEDS_WRITABLE: ReadonlySet<OpKind> = new Set(['rename', 'move', 'trash', 'restore']);

export function nodesOfOp<O>(op: FileOp<O>): readonly FileNode<O>[] {
  if (op.kind === 'new_folder') return [];
  return op.kind === 'rename' ? [op.node] : op.nodes;
}

export function nodeAllows(kind: OpKind, node: FileNode): boolean {
  if (kind === 'delete_now') return node.deletable;
  if (NEEDS_WRITABLE.has(kind) && !node.writable) return false;
  return kind !== 'copy' || node.exportable;
}

export function opAllowed<O>(op: FileOp<O>, abilities: FileAbilities): boolean {
  if (!abilities[OP_ABILITY[op.kind]]) return false;
  const nodes = nodesOfOp(op);
  if (op.kind !== 'new_folder' && nodes.length === 0) return false;
  return nodes.every((node) => nodeAllows(op.kind, node));
}

export function refusedOf<O>(op: FileOp<O>, reason: string): OpResult {
  const keys =
    op.kind === 'new_folder'
      ? [`${locationKeyOf(op.in)}\n${op.name}`]
      : nodesOfOp(op).map((node) => node.key);
  return { done: [], failed: keys.map((key) => ({ key, reason })), undo: null };
}

export function opTargetsLocation<O>(op: FileOp<O>): FileLocation | null {
  if (op.kind === 'new_folder') return op.in;
  return op.kind === 'move' || op.kind === 'copy' ? op.to : null;
}

const DONE_VERB: Readonly<Record<OpKind, string>> = {
  new_folder: 'Created',
  rename: 'Renamed',
  move: 'Moved',
  copy: 'Copied',
  trash: 'Moved to Trash',
  restore: 'Restored',
  delete_now: 'Deleted for good',
  star: 'Starred',
  unstar: 'Unstarred',
};

const FAILED_VERB: Readonly<Record<OpKind, string>> = {
  new_folder: 'created',
  rename: 'renamed',
  move: 'moved',
  copy: 'copied',
  trash: 'moved to Trash',
  restore: 'restored',
  delete_now: 'deleted',
  star: 'starred',
  unstar: 'unstarred',
};

export type OpTone = 'done' | 'partial' | 'failed';

export interface OpNotice {
  readonly tone: OpTone;
  readonly title: string;
  readonly reasons: readonly string[];
  readonly undo: (() => Promise<OpResult>) | null;
  readonly follow: OpFollow | null;
}

function doneTitle(kind: OpKind, done: number): string {
  if (kind === 'new_folder') return 'Folder created';
  if (kind === 'rename') return 'Renamed';
  return `${DONE_VERB[kind]} · ${plural(done, 'item')}`;
}

function failedTitle(kind: OpKind, failed: number): string {
  const subject = kind === 'new_folder' ? 'The folder' : plural(failed, 'item');
  return `${subject} couldn’t be ${FAILED_VERB[kind]}`;
}

export function opNoticeOf<O>(op: FileOp<O>, result: OpResult): OpNotice {
  const reasons = [...new Set(result.failed.map((failure) => failure.reason))];
  const done = result.done.length;
  if (done === 0) {
    const failed = result.failed.length === 0 ? nodesOfOp(op).length : result.failed.length;
    return {
      tone: 'failed',
      title: failedTitle(op.kind, failed),
      reasons,
      undo: null,
      follow: null,
    };
  }
  const follow = result.follow ?? null;
  if (result.failed.length === 0) {
    return { tone: 'done', title: doneTitle(op.kind, done), reasons, undo: result.undo, follow };
  }
  return {
    tone: 'partial',
    title: `${doneTitle(op.kind, done)} · ${failedTitle(op.kind, result.failed.length)}`,
    reasons,
    undo: result.undo,
    follow,
  };
}
