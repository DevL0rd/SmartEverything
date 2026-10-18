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
function detach(
  actions: readonly Action[],
  nodeId: AutomationNodeId,
): { readonly rest: Action[]; readonly node: Action } {
  const found: { node: Action | undefined } = { node: undefined };
  const visit = (block: readonly Action[]): Action[] =>
    block.flatMap((action) => {
      if (action.nodeId === nodeId) {
        found.node = action;
        return [];
      }
      return [changeChildren(action, visit)];
    });
  const rest = visit(actions);
  if (found.node === undefined) throw new AutomationTreeEditError(`node ${nodeId} does not exist`);
  return { rest, node: found.node };
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
export function moveAutomationNode(
  actions: readonly Action[],
  nodeId: AutomationNodeId,
  target: AutomationBlockTarget,
): readonly Action[] {
  const { rest, node } = detach(actions, nodeId);
  return z
    .array(ACTION)
    .superRefine(validateActionTree)
    .parse(insert(rest, target, [node]));
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
