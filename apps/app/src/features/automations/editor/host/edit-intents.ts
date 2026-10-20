import { indexProgram } from '@smarteverything/flow/program/lookup';
import { BODY_PATH, formatScopePath } from '@smarteverything/flow/program/paths';
import type { Program } from '@smarteverything/flow/program/walk';
import { TRIGGERS_TARGET } from '@smarteverything/flow/ops/schema';
import type { Shortcut } from '../../model/canvas/contract';
import {
  copyPayload,
  duplicateOps,
  parseClipboard,
  pasteOps,
  removeOps,
  serializeClipboard,
  type PasteTarget,
} from '../../model/editor/clipboard';
import type { DocumentStore } from '../../model/editor/document-store';
import { programOrder } from '../../model/editor/selection';
import type { IntentEnv } from './intent-env';

export const REFUSED_PASTE = 'The clipboard does not hold automation nodes.';

type ShortcutHandler = (env: IntentEnv) => void | Promise<void>;

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

export function selectIds(store: DocumentStore, ids: readonly string[]): void {
  const state = store.state.get();
  const known = new Set(programOrder(state.program));
  const wanted = [...new Set(ids.filter((id) => known.has(id)))];
  if (sameMembers(wanted, state.selection.ids)) return;
  const [first, ...rest] = wanted;
  if (first === undefined) {
    store.clearSelected();
    return;
  }
  store.select(first);
  for (const id of rest) store.toggleSelect(id);
}

export function deleteIds(store: DocumentStore, ids: readonly string[]): void {
  const ops = removeOps(store.state.get().program, ids);
  if (ops.length > 0) store.apply(ops);
}

function selectedIds(env: IntentEnv): readonly string[] {
  return env.store.state.get().selection.ids;
}

async function copySelection(env: IntentEnv): Promise<void> {
  const payload = copyPayload(env.store.state.get().program, selectedIds(env));
  if (payload !== undefined) await env.clipboard.write(serializeClipboard(payload));
}

async function cutSelection(env: IntentEnv): Promise<void> {
  await copySelection(env);
  deleteIds(env.store, selectedIds(env));
}

function pasteTarget(program: Program, anchor: string | null): PasteTarget {
  const entry = anchor === null ? undefined : indexProgram(program).byId.get(anchor);
  if (entry?.kind === 'node') {
    return { in: formatScopePath(entry.scope), after: entry.node.key };
  }
  return { in: entry?.kind === 'trigger' ? TRIGGERS_TARGET : formatScopePath(BODY_PATH) };
}

async function pasteClipboard(env: IntentEnv): Promise<void> {
  const payload = parseClipboard(await env.clipboard.read());
  if (payload === undefined) {
    env.actions.refused(REFUSED_PASTE);
    return;
  }
  const { program, selection } = env.store.state.get();
  env.store.apply(pasteOps(payload, program, pasteTarget(program, selection.anchor)).ops);
}

function duplicateSelection(env: IntentEnv): void {
  const ops = duplicateOps(env.store.state.get().program, selectedIds(env));
  if (ops.length > 0) env.store.apply(ops);
}

const SHORTCUT_HANDLERS: Readonly<Record<Shortcut, ShortcutHandler>> = {
  undo: (env) => {
    env.store.undo();
  },
  redo: (env) => {
    env.store.redo();
  },
  selectAll: (env) => {
    env.store.selectEverything();
  },
  copy: copySelection,
  cut: cutSelection,
  paste: pasteClipboard,
  duplicate: duplicateSelection,
  group: (env) => {
    env.actions.groupSelection(selectedIds(env));
  },
};

export async function runShortcut(name: Shortcut, env: IntentEnv): Promise<void> {
  await SHORTCUT_HANDLERS[name](env);
}
