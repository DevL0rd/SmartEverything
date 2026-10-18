import { describe, expect, it } from 'vitest';
import {
  ACTION,
  AUTOMATION_NODE_ID,
  AutomationTreeEditError,
  moveAutomationNode,
  type Action,
  type AutomationBlockTarget,
  type AutomationNodeId,
} from '../src';

const ids = Array.from({ length: 8 }, (_, index) =>
  AUTOMATION_NODE_ID.parse(`00000000-0000-4000-8000-00000000000${String(index)}`),
);

function id(index: number): AutomationNodeId {
  const value = ids[index];
  if (value === undefined) throw new Error('missing fixture id');
  return value;
}

function notify(index: number): Action {
  return ACTION.parse({ type: 'notify', message: `step ${String(index)}`, nodeId: id(index) });
}

function repeat(index: number, actions: readonly Action[]): Action {
  return ACTION.parse({
    type: 'repeat',
    nodeId: id(index),
    repeat: { mode: 'count', count: 2 },
    actions,
    maximumDurationMs: 1000,
    intervalMs: 100,
  });
}

function choose(index: number, branch: number, actions: readonly Action[]): Action {
  return ACTION.parse({
    type: 'choose',
    nodeId: id(index),
    branches: [{ nodeId: id(branch), conditions: { mode: 'all', items: [] }, actions }],
    otherwise: [],
  });
}

function nodeIdsOf(actions: readonly Action[]): readonly (string | undefined)[] {
  return actions.map((action) => action.nodeId);
}

const ROOT = (index: number): AutomationBlockTarget => ({ parentId: null, block: 'root', index });

describe('moveAutomationNode', () => {
  it('moves a root action to a later root position', () => {
    const moved = moveAutomationNode([notify(0), notify(1), notify(2)], id(0), ROOT(2));
    expect(nodeIdsOf(moved)).toEqual([id(1), id(2), id(0)]);
  });

  it('moves an action into a repeat body', () => {
    const moved = moveAutomationNode([notify(0), repeat(1, [notify(2)])], id(0), {
      parentId: id(1),
      block: 'body',
      index: 0,
    });
    expect(nodeIdsOf(moved)).toEqual([id(1)]);
    const group = moved[0];
    expect(group?.type === 'repeat' ? nodeIdsOf(group.actions) : null).toEqual([id(0), id(2)]);
  });

  it('moves an action out of a repeat body to the root', () => {
    const moved = moveAutomationNode([repeat(1, [notify(2), notify(3)])], id(2), ROOT(0));
    expect(nodeIdsOf(moved)).toEqual([id(2), id(1)]);
  });

  it('moves an action into the otherwise block and a branch of a choose', () => {
    const tree = [notify(0), notify(4), choose(1, 2, [])];
    const otherwise = moveAutomationNode(tree, id(0), {
      parentId: id(1),
      block: 'otherwise',
      index: 0,
    });
    const chosen = otherwise[1];
    expect(chosen?.type === 'choose' ? nodeIdsOf(chosen.otherwise ?? []) : null).toEqual([id(0)]);
    const branch = moveAutomationNode(tree, id(4), { parentId: id(1), block: id(2), index: 0 });
    const target = branch[1];
    expect(target?.type === 'choose' ? nodeIdsOf(target.branches[0]?.actions ?? []) : null).toEqual(
      [id(4)],
    );
  });

  it('refuses a node that does not exist', () => {
    expect(() => moveAutomationNode([notify(0)], id(5), ROOT(0))).toThrow(AutomationTreeEditError);
  });

  it('refuses a block that does not exist', () => {
    expect(() =>
      moveAutomationNode([notify(0)], id(0), { parentId: id(6), block: 'body', index: 0 }),
    ).toThrow('target block does not exist');
  });

  it.each([-1, 2, 0.5])('refuses the position %s outside the block', (index) => {
    expect(() => moveAutomationNode([notify(0), notify(1)], id(0), ROOT(index))).toThrow(
      'insertion position is outside its block',
    );
  });

  it('refuses moving a node into itself', () => {
    expect(() =>
      moveAutomationNode([repeat(1, [notify(2)])], id(1), {
        parentId: id(1),
        block: 'body',
        index: 0,
      }),
    ).toThrow(AutomationTreeEditError);
  });

  it('refuses moving an action carrying unidentified children', () => {
    const loose = ACTION.parse({
      type: 'repeat',
      nodeId: id(1),
      repeat: { mode: 'count', count: 2 },
      actions: [{ type: 'notify', message: 'loose' }],
      maximumDurationMs: 1000,
      intervalMs: 100,
    });
    expect(() => moveAutomationNode([notify(0), loose], id(1), ROOT(0))).toThrow(
      'Inserted actions require stable node identities',
    );
  });

  it('does not change the original tree', () => {
    const tree = [notify(0), notify(1)];
    moveAutomationNode(tree, id(0), ROOT(1));
    expect(nodeIdsOf(tree)).toEqual([id(0), id(1)]);
  });
});
