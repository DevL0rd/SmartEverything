import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { applyPatch } from '@smarteverything/flow/graph/ops/reducer';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { NODE_REGISTRY, type GraphNode, type ProgramV4 } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  automation,
  forkProgram,
  gnode,
  join,
  note,
  start,
  together,
} from '../../../model/graph/graph-scene-fixtures';
import {
  addPathOps,
  forkOf,
  joinOptionOps,
  joinOptionsOf,
  nextPathName,
  pathNameProblem,
  pathsOf,
  removePathOps,
  renamePathOps,
} from './graph-paths-model';

function nodeOf(program: ProgramV4, key: string): GraphNode {
  const found = program.nodes.find((node) => node.key === key);
  if (found === undefined) throw new Error(`no node ${key}`);
  return found;
}

function applied(program: ProgramV4, ops: readonly PatchOp[]): ProgramV4 {
  const result = applyPatch(program, ops, {
    kinds: STATIC_KIND_LOOKUP,
    newId: () => crypto.randomUUID(),
    allowProblems: true,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.program;
}

function threePaths(): ProgramV4 {
  return automation([
    start('both'),
    together(
      'both',
      [
        { name: 'left', to: 'l' },
        { name: 'right', to: 'r' },
        { name: 'extra', to: 'meet' },
      ],
      { ports: { join: { lit: 'all' } } },
    ),
    note('l', 'meet'),
    note('r', 'meet'),
    join('meet', 'after'),
    note('after'),
  ]);
}

describe('pathsOf', () => {
  it('describes every path and the Wait for all it meets', () => {
    const program = threePaths();
    const model = pathsOf(program, nodeOf(program, 'both'), NODE_REGISTRY);
    expect(model?.rows.map((row) => row.name)).toEqual(['left', 'right', 'extra']);
    expect(model?.joinName).toBe('Wait for all');
    expect(model?.rows[2]).toMatchObject({
      straightToJoin: true,
      text: 'Goes straight to Wait for all',
    });
    expect(model?.rows[0]?.straightToJoin).toBe(false);
    expect(model?.rows[0]?.text.startsWith('Starts with')).toBe(true);
  });

  it('keeps the minimum of two paths', () => {
    const two = forkProgram('all');
    expect(pathsOf(two, nodeOf(two, 'both'), NODE_REGISTRY)).toMatchObject({
      minimum: 2,
      canRemove: false,
    });
    const three = threePaths();
    expect(pathsOf(three, nodeOf(three, 'both'), NODE_REGISTRY)?.canRemove).toBe(true);
  });

  it('is only for a Do together', () => {
    const program = forkProgram('all');
    expect(pathsOf(program, nodeOf(program, 'l'), NODE_REGISTRY)).toBeUndefined();
  });
});

describe('path edits', () => {
  it('adds a path that goes straight to the Wait for all', () => {
    const program = forkProgram('all');
    const next = applied(program, addPathOps('both', 'path3'));
    const model = pathsOf(next, nodeOf(next, 'both'), NODE_REGISTRY);
    expect(model?.rows.at(-1)).toMatchObject({ name: 'path3', straightToJoin: true });
  });

  it('renames and removes a path', () => {
    const program = threePaths();
    const renamed = applied(program, renamePathOps('both', 'extra', 'quick'));
    expect(nodeOf(renamed, 'both').paths?.map((path) => path.name)).toEqual([
      'left',
      'right',
      'quick',
    ]);
    const removed = applied(renamed, removePathOps('both', 'quick'));
    expect(nodeOf(removed, 'both').paths?.map((path) => path.name)).toEqual(['left', 'right']);
  });
});

describe('path names', () => {
  it('picks the next free name', () => {
    expect(nextPathName(['path1', 'path2'])).toBe('path3');
    expect(nextPathName(['path3'])).toBe('path2');
  });

  it('refuses taken, malformed and reserved names', () => {
    const names = ['left', 'right'];
    expect(pathNameProblem(names, 'left', 'left')).toBeUndefined();
    expect(pathNameProblem(names, 'left', 'right')).toBe('A path with that name exists.');
    expect(pathNameProblem(names, 'left', '1x')).toMatch(/Use letters/);
    expect(pathNameProblem(names, 'left', 'onError')).toMatch(/failure lane/);
    expect(pathNameProblem(names, 'left', 'centre')).toBeUndefined();
  });
});

describe('joinOptionsOf', () => {
  it('shows the fork options on the Wait for all', () => {
    const program = forkProgram('first');
    const options = joinOptionsOf(program, nodeOf(program, 'meet'), NODE_REGISTRY);
    expect(options).toMatchObject({
      forkKey: 'both',
      join: 'first',
      errors: 'failFast',
      recordsEach: false,
      title: 'First to finish wins',
    });
    expect(options?.joinChoices.map((choice) => choice.value)).toEqual(['all', 'first', 'settled']);
    expect(options?.errorChoices.map((choice) => choice.value)).toEqual(['failFast', 'settle']);
    expect(forkOf(program, nodeOf(program, 'meet'), STATIC_KIND_LOOKUP)?.key).toBe('both');
  });

  it('reports a settled join as recording each result', () => {
    const program = forkProgram('settled');
    expect(joinOptionsOf(program, nodeOf(program, 'both'), NODE_REGISTRY)?.recordsEach).toBe(true);
  });

  it('is absent on other steps and when an option is wired', () => {
    const program = forkProgram('all');
    expect(joinOptionsOf(program, nodeOf(program, 'l'), NODE_REGISTRY)).toBeUndefined();
    const wired = automation([
      start('both'),
      gnode('both', 'flow.parallel', {
        paths: [{ name: 'a' }, { name: 'b' }],
        ports: { join: { wire: { from: 'sensor', port: 'value' } } },
      }),
    ]);
    expect(joinOptionsOf(wired, nodeOf(wired, 'both'), NODE_REGISTRY)?.join).toBeUndefined();
  });

  it('edits an option through a set op', () => {
    const program = forkProgram('all');
    const next = applied(program, joinOptionOps('both', 'join', 'settled'));
    expect(joinOptionsOf(next, nodeOf(next, 'meet'), NODE_REGISTRY)?.recordsEach).toBe(true);
    const errors = applied(program, joinOptionOps('both', 'errors', 'settle'));
    expect(joinOptionsOf(errors, nodeOf(errors, 'meet'), NODE_REGISTRY)?.errors).toBe('settle');
  });
});
