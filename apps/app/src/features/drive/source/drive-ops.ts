import type {
  DriveChange,
  DriveChangeResult,
  DriveFolderPlace,
  DriveRoot,
  DriveShortcut,
  DriveShortcutChange,
  DriveShortcutCreate,
} from '@smarteverything/domain';
import { appendTo } from '@smarteverything/domain';
import { rawErrorText } from '../../../format/errors';
import {
  NOTHING_DONE,
  nodeAllows,
  nodesOfOp,
  refusedOf,
  type FileOp,
  type OpFailure,
  type OpResult,
  type FileLocation,
} from '../../files';
import { itemIdOf, itemOf, type DriveNode, type DriveOrigin } from './drive-node';
import { DRIVE_PLACES, folderPlaceOf } from './drive-places';
import { restoredFollowOf, type RestoreEnv } from './drive-restore';

export interface DriveShortcutCalls {
  readonly update: (shortcutId: string, body: DriveShortcutChange) => Promise<unknown>;
  readonly remove: (shortcutId: string) => Promise<unknown>;
  readonly create: (body: DriveShortcutCreate) => Promise<unknown>;
}

export interface DriveOpsEnv {
  readonly change: (body: DriveChange) => Promise<DriveChangeResult>;
  readonly shortcuts: DriveShortcutCalls;
  readonly roots: readonly DriveRoot[];
  readonly viewerId: string | null;
  readonly restore: RestoreEnv;
}

export type DriveFileOp = FileOp<DriveOrigin>;

export const NO_TOP_MOVE = 'Items can’t be moved to the top of a drive, only into a folder.';

export const NOT_ALLOWED = 'This can’t be done to these items.';

export const NO_PLACE_HERE = 'Nothing can be added in this place.';

export const NO_SHORTCUT_BACK =
  'This shortcut points to something you can no longer open, so it can’t be put back.';

const idsOf = (nodes: readonly DriveNode[]): readonly string[] => nodes.map(itemIdOf);

function folderOf(location: FileLocation): string | null {
  return location.place === DRIVE_PLACES.trash ? null : location.folder;
}

function newFolderOf(
  op: Extract<DriveFileOp, { readonly kind: 'new_folder' }>,
  env: DriveOpsEnv,
): DriveChange | string {
  const parent: DriveFolderPlace | null = folderPlaceOf(op.in, env.roots, env.viewerId);
  return parent === null ? NO_PLACE_HERE : { action: 'new_folder', parent, name: op.name };
}

function intoFolderOf(
  op: Extract<DriveFileOp, { readonly kind: 'move' | 'copy' }>,
): DriveChange | string {
  const toFolderId = folderOf(op.to);
  return toFolderId === null
    ? NO_TOP_MOVE
    : { action: op.kind, itemIds: idsOf(op.nodes), toFolderId };
}

export function driveChangeOf(op: DriveFileOp, env: DriveOpsEnv): DriveChange | string {
  switch (op.kind) {
    case 'new_folder':
      return newFolderOf(op, env);
    case 'rename':
      return { action: 'rename', itemId: itemIdOf(op.node), name: op.name };
    case 'move':
    case 'copy':
      return intoFolderOf(op);
    case 'trash':
    case 'restore':
    case 'delete_now':
    case 'star':
    case 'unstar':
      return { action: op.kind, itemIds: idsOf(op.nodes) };
  }
}

function conflictText(name: string): string {
  return `“${name}” already exists there.`;
}

export function opResultOf(newFolder: boolean, result: DriveChangeResult): OpResult {
  const failed: OpFailure[] = result.failed.map((failure) => ({
    key: failure.itemId ?? '',
    reason: failure.reason,
  }));
  const reported = new Set(failed.map((failure) => failure.key));
  for (const conflict of result.conflicts) {
    const key = conflict.itemId ?? '';
    if (!reported.has(key)) failed.push({ key, reason: conflictText(conflict.name) });
  }
  const done = result.done.map((entry) =>
    newFolder ? (entry.resultItemId ?? entry.itemId) : entry.itemId,
  );
  return { done, failed, undo: null };
}

type ShortcutOp = Extract<DriveFileOp, { readonly kind: 'rename' | 'move' | 'trash' }>;

const ON_SHORTCUT: ReadonlySet<DriveFileOp['kind']> = new Set(['rename', 'move', 'trash']);

function onShortcut(op: DriveFileOp): op is ShortcutOp {
  return ON_SHORTCUT.has(op.kind);
}

interface Cut {
  readonly node: DriveNode;
  readonly shortcut: DriveShortcut;
  readonly target: DriveNode | null;
}

function cutOf(node: DriveNode): Cut | null {
  return node.origin.kind === 'shortcut'
    ? { node, shortcut: node.origin.shortcut, target: node.origin.target }
    : null;
}

function placeOfShortcut(shortcut: DriveShortcut): DriveFolderPlace {
  return shortcut.parentId === null
    ? { kind: 'drive', rootId: shortcut.rootId }
    : { kind: 'folder', folderId: shortcut.parentId };
}

type Undo = OpResult['undo'];

async function settled(
  key: string,
  call: () => Promise<unknown> | string,
  undo: Undo = null,
): Promise<OpResult> {
  try {
    const pending = call();
    if (typeof pending === 'string')
      return { done: [], failed: [{ key, reason: pending }], undo: null };
    await pending;
    return { done: [key], failed: [], undo };
  } catch (error) {
    return { done: [], failed: [{ key, reason: rawErrorText(error) }], undo: null };
  }
}

function shortcutCall(
  op: ShortcutOp,
  shortcut: DriveShortcut,
  env: DriveOpsEnv,
): Promise<unknown> | string {
  switch (op.kind) {
    case 'rename':
      return env.shortcuts.update(shortcut.id, { name: op.name });
    case 'move': {
      const place = folderPlaceOf(op.to, env.roots, env.viewerId);
      return place === null ? NO_PLACE_HERE : env.shortcuts.update(shortcut.id, { place });
    }
    case 'trash':
      return env.shortcuts.remove(shortcut.id);
  }
}

function putBack({ node, shortcut }: Cut, env: DriveOpsEnv): Promise<unknown> | string {
  const { target } = shortcut;
  if (target.state === 'unavailable') return NO_SHORTCUT_BACK;
  return env.shortcuts.create({
    targetItemId: target.item.id,
    place: placeOfShortcut(shortcut),
    name: node.name,
  });
}

function undoAll(results: readonly OpResult[]): Undo {
  const acted = results.filter((result) => result.done.length > 0);
  const undos = acted.flatMap((result) => (result.undo === null ? [] : [result.undo]));
  if (acted.length === 0 || undos.length < acted.length) return null;
  return async () => merged(await Promise.all(undos.map((undo) => undo())));
}

function merged(results: readonly OpResult[]): OpResult {
  const follow = results.find((result) => result.follow !== undefined)?.follow;
  return {
    done: results.flatMap((result) => result.done),
    failed: results.flatMap((result) => result.failed),
    undo: undoAll(results),
    ...(follow === undefined ? {} : { follow }),
  };
}

async function applied(change: DriveChange, env: DriveOpsEnv): Promise<OpResult> {
  try {
    return opResultOf(false, await env.change(change));
  } catch (error) {
    const keys = 'itemIds' in change ? change.itemIds : [];
    const reason = rawErrorText(error);
    return { done: [], failed: keys.map((key) => ({ key, reason })), undo: null };
  }
}

function movesBackOf(
  nodes: readonly DriveNode[],
  moved: ReadonlySet<string>,
): DriveChange[] | null {
  const back = new Map<string, string[]>();
  for (const node of nodes) {
    const id = itemIdOf(node);
    if (!moved.has(id)) continue;
    const from = itemOf(node)?.parentId ?? null;
    if (from === null) return null;
    appendTo(back, from, id);
  }
  return [...back].map(([toFolderId, itemIds]) => ({ action: 'move', itemIds, toFolderId }));
}

function itemUndoOf(op: DriveFileOp, raw: DriveChangeResult, env: DriveOpsEnv): Undo {
  if (op.kind === 'copy') {
    const copies = raw.done.flatMap((entry) =>
      entry.resultItemId === null ? [] : [entry.resultItemId],
    );
    return copies.length === 0
      ? null
      : (): Promise<OpResult> => applied({ action: 'trash', itemIds: copies }, env);
  }
  if (op.kind !== 'move') return null;
  const back = movesBackOf(op.nodes, new Set(raw.done.map((entry) => entry.itemId)));
  if (back === null || back.length === 0) return null;
  return async (): Promise<OpResult> =>
    merged(await Promise.all(back.map((change) => applied(change, env))));
}

function withNodes(op: DriveFileOp, nodes: readonly DriveNode[]): DriveFileOp | null {
  if (nodes.length === 0) return null;
  if (op.kind === 'new_folder') return op;
  if (op.kind === 'rename') return nodes[0] === undefined ? null : { ...op, node: nodes[0] };
  return { ...op, nodes };
}

async function changed(op: DriveFileOp | null, env: DriveOpsEnv): Promise<OpResult> {
  if (op === null) return NOTHING_DONE;
  const change = driveChangeOf(op, env);
  if (typeof change === 'string') return refusedOf(op, change);
  try {
    const raw = await env.change(change);
    const follow = op.kind === 'restore' ? await restoredFollowOf(raw, env.restore) : null;
    return {
      ...opResultOf(op.kind === 'new_folder', raw),
      undo: itemUndoOf(op, raw, env),
      ...(follow === null ? {} : { follow }),
    };
  } catch (error) {
    return refusedOf(op, rawErrorText(error));
  }
}

function cutsOf(nodes: readonly DriveNode[], test: (cut: Cut) => boolean): readonly Cut[] {
  return nodes.flatMap((node) => {
    const cut = cutOf(node);
    return cut !== null && test(cut) ? [cut] : [];
  });
}

function itemsBeside(nodes: readonly DriveNode[], cuts: readonly Cut[]): readonly DriveNode[] {
  const keys = new Set(cuts.map((cut) => cut.node.key));
  return nodes.filter((node) => !keys.has(node.key));
}

function shortcutUndoOf(op: DriveFileOp, cut: Cut, env: DriveOpsEnv): Undo {
  if (op.kind !== 'move') return null;
  const place = placeOfShortcut(cut.shortcut);
  return () => settled(cut.node.key, () => env.shortcuts.update(cut.shortcut.id, { place }));
}

function shortcutResult(op: DriveFileOp, cut: Cut, env: DriveOpsEnv): Promise<OpResult> {
  return settled(
    cut.node.key,
    () => (onShortcut(op) ? shortcutCall(op, cut.shortcut, env) : NOT_ALLOWED),
    shortcutUndoOf(op, cut, env),
  );
}

async function settledOp(op: DriveFileOp, env: DriveOpsEnv): Promise<OpResult> {
  if (op.kind === 'new_folder') return changed(op, env);
  const nodes = nodesOfOp(op);
  const cuts = cutsOf(nodes, (cut) => onShortcut(op) || cut.target === null);
  const items = itemsBeside(nodes, cuts);
  return merged(
    await Promise.all([
      ...cuts.map((cut) => shortcutResult(op, cut, env)),
      changed(withNodes(op, items), env),
    ]),
  );
}

async function restored(nodes: readonly DriveNode[], env: DriveOpsEnv): Promise<OpResult> {
  const cuts = cutsOf(nodes, () => true);
  const items = itemsBeside(nodes, cuts);
  const restore: DriveFileOp | null = items.length === 0 ? null : { kind: 'restore', nodes: items };
  return merged(
    await Promise.all([
      ...cuts.map((cut) => settled(cut.node.key, () => putBack(cut, env))),
      changed(restore, env),
    ]),
  );
}

function undoOf(op: DriveFileOp, result: OpResult, env: DriveOpsEnv): Undo {
  if (result.done.length === 0) return null;
  if (op.kind !== 'trash') return op.kind === 'move' || op.kind === 'copy' ? result.undo : null;
  const back = op.nodes.filter((node) => result.done.includes(node.key));
  return () => restored(back, env);
}

export async function runDriveOp(op: DriveFileOp, env: DriveOpsEnv): Promise<OpResult> {
  if (!nodesOfOp(op).every((node) => nodeAllows(op.kind, node))) return refusedOf(op, NOT_ALLOWED);
  const result = await settledOp(op, env);
  return result.done.length === 0 && result.failed.length === 0
    ? NOTHING_DONE
    : { ...result, undo: undoOf(op, result, env) };
}
