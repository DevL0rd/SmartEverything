import { z } from 'zod';
import {
  ACTION,
  AUTOMATION_NODE_ID,
  validateActionTree,
  walkActions,
  type Action,
  type AutomationNodeId,
} from './automation-actions';

export const AUTOMATION_TREE_HISTORY_LIMIT = 100;

export class AutomationTreeEditError extends Error {
  override readonly name = 'AutomationTreeEditError';
  constructor(readonly reason: string) {
    super(`Action edit refused: ${reason}`);
  }
}
export interface AutomationBlockTarget {
  readonly parentId: AutomationNodeId | null;
  readonly block: 'root' | 'body' | 'otherwise' | AutomationNodeId;
  readonly index: number;
}
export type AutomationTreeEdit =
  | {
      readonly type: 'insert';
      readonly target: AutomationBlockTarget;
      readonly actions: readonly Action[];
    }
  | { readonly type: 'replace'; readonly nodeId: AutomationNodeId; readonly action: Action }
  | { readonly type: 'remove'; readonly nodeId: AutomationNodeId }
  | {
      readonly type: 'move';
      readonly nodeId: AutomationNodeId;
      readonly target: AutomationBlockTarget;
    }
  | {
      readonly type: 'group';
      readonly nodeIds: readonly AutomationNodeId[];
      readonly group: Extract<Action, { type: 'repeat' }>;
    }
  | { readonly type: 'ungroup'; readonly nodeId: AutomationNodeId };
export interface AutomationTreeTransaction {
  readonly type: 'transaction';
  readonly edits: readonly AutomationTreeEdit[];
}
export interface AutomationTreeHistory {
  readonly present: readonly Action[];
  readonly past: readonly (readonly Action[])[];
  readonly future: readonly (readonly Action[])[];
}
function changeChildren(
  action: Action,
  edit: (block: readonly Action[], parent: AutomationNodeId | null, name: string) => Action[],
): Action {
  if (action.type === 'repeat')
    return { ...action, actions: edit(action.actions, action.nodeId, 'body') };
  if (action.type !== 'choose') return action;
  return {
    ...action,
    branches: action.branches.map((branch) => ({
      ...branch,
      actions: edit(branch.actions, action.nodeId, branch.nodeId),
    })),
    ...(action.otherwise === undefined
      ? {}
      : { otherwise: edit(action.otherwise, action.nodeId, 'otherwise') }),
  };
}
function transform(
  actions: readonly Action[],
  nodeId: AutomationNodeId,
  replace: (action: Action) => readonly Action[],
): Action[] {
  const found = { value: false };
  const visit = (block: readonly Action[]): Action[] =>
    block.flatMap((action) => {
      if (action.nodeId === nodeId) {
        found.value = true;
        return [...replace(action)];
      }
      return [changeChildren(action, visit)];
    });
  const result = visit(actions);
  if (!found.value) throw new AutomationTreeEditError(`node ${nodeId} does not exist`);
  return result;
}
function insert(
  actions: readonly Action[],
  target: AutomationBlockTarget,
  added: readonly Action[],
): Action[] {
  if (walkActions(added).some((action) => action.nodeId === undefined))
    throw new AutomationTreeEditError('Inserted actions require stable node identities');
  const found = { value: false };
  const visit = (
    block: readonly Action[],
    parent: AutomationNodeId | null,
    name: string,
  ): Action[] => {
    if (target.parentId === parent && target.block === name) {
      if (!Number.isInteger(target.index) || target.index < 0 || target.index > block.length)
        throw new AutomationTreeEditError('insertion position is outside its block');
      found.value = true;
      return [...block.slice(0, target.index), ...added, ...block.slice(target.index)];
    }
    return block.map((action) => changeChildren(action, visit));
  };
  const result = visit(actions, null, 'root');
  if (!found.value) throw new AutomationTreeEditError('target block does not exist');
  return result;
}
function applyEdit(actions: readonly Action[], edit: AutomationTreeEdit): Action[] {
  switch (edit.type) {
    case 'insert':
      return insert(actions, edit.target, edit.actions);
    case 'replace':
      if (edit.action.nodeId !== edit.nodeId)
        throw new AutomationTreeEditError('replacement must retain node identity');
      return transform(actions, edit.nodeId, () => [edit.action]);
    case 'remove':
      return transform(actions, edit.nodeId, () => []);
    case 'move': {
      let moved: Action | undefined;
      const removed = transform(actions, edit.nodeId, (action) => {
        moved = action;
        return [];
      });
      if (moved === undefined) throw new AutomationTreeEditError('move source does not exist');
      return insert(removed, edit.target, [moved]);
    }
    case 'group':
      return groupActions(actions, edit);
    case 'ungroup':
      return transform(actions, edit.nodeId, (action) => {
        if (action.type !== 'repeat')
          throw new AutomationTreeEditError('only repeat bodies can be ungrouped');
        return action.actions;
      });
  }
}
function groupActions(
  actions: readonly Action[],
  edit: Extract<AutomationTreeEdit, { type: 'group' }>,
): Action[] {
  const selected = new Set(edit.nodeIds);
  const found = { value: false };
  const visit = (block: readonly Action[]): Action[] => {
    const indexes = block.flatMap((action, index) =>
      action.nodeId !== undefined && selected.has(action.nodeId) ? [index] : [],
    );
    if (indexes.length === 0) return block.map((action) => changeChildren(action, visit));
    const start = indexes[0];
    if (
      start === undefined ||
      indexes.length !== selected.size ||
      indexes.some((index, offset) => index !== start + offset)
    )
      throw new AutomationTreeEditError('group selection must be contiguous in one block');
    found.value = true;
    return [
      ...block.slice(0, start),
      { ...edit.group, actions: block.slice(start, start + indexes.length) },
      ...block.slice(start + indexes.length),
    ];
  };
  const result = visit(actions);
  if (!found.value) throw new AutomationTreeEditError('group selection is empty or missing');
  return result;
}
export function editAutomationTree(
  actions: readonly Action[],
  edit: AutomationTreeEdit | AutomationTreeTransaction,
): readonly Action[] {
  const operations = edit.type === 'transaction' ? edit.edits : [edit];
  const next = operations.reduce((block, operation) => applyEdit(block, operation), [...actions]);
  return z.array(ACTION).superRefine(validateActionTree).parse(next);
}
export function reduceAutomationTree(
  history: AutomationTreeHistory,
  edit:
    | AutomationTreeEdit
    | AutomationTreeTransaction
    | { readonly type: 'undo' }
    | { readonly type: 'redo' },
): AutomationTreeHistory {
  if (edit.type === 'undo') {
    const previous = history.past.at(-1);
    return previous === undefined
      ? history
      : {
          present: previous,
          past: history.past.slice(0, -1),
          future: [history.present, ...history.future],
        };
  }
  if (edit.type === 'redo') {
    const next = history.future[0];
    return next === undefined
      ? history
      : {
          present: next,
          past: [...history.past, history.present],
          future: history.future.slice(1),
        };
  }
  return {
    present: editAutomationTree(history.present, edit),
    past: [...history.past, history.present].slice(-AUTOMATION_TREE_HISTORY_LIMIT),
    future: [],
  };
}
export function identifyActions(
  actions: readonly Action[],
  newId: () => string,
  remap = false,
): Action[] {
  return actions.map((action) => {
    const identified = {
      ...action,
      nodeId:
        !remap && action.nodeId !== undefined ? action.nodeId : AUTOMATION_NODE_ID.parse(newId()),
    };
    const nested = changeChildren(identified, (block) => identifyActions(block, newId, remap));
    return nested.type === 'choose'
      ? {
          ...nested,
          branches: nested.branches.map((branch) => ({
            ...branch,
            nodeId: remap ? AUTOMATION_NODE_ID.parse(newId()) : branch.nodeId,
          })),
        }
      : nested;
  });
}
