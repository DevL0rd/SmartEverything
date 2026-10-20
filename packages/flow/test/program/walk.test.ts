import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { visitNodes } from '@smarteverything/domain';
import { automationV3, functionV3 } from '../../../domain/test/support/automation-v3-arbitraries';
import { formatScopePath } from '../../src/program/paths';
import type { Program } from '../../src/program/walk';
import { childScopeRefs, rootScopes, walkProgram } from '../../src/program/walk';

const programs = fc.oneof(automationV3, functionV3);

function at(program: Program, storage: readonly (string | number)[]): unknown {
  let current: unknown = program;
  for (const segment of storage) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = Reflect.get(current, segment);
  }
  return current;
}

function domainCount(program: Program): number {
  const roots = [
    program.body,
    ...('onFailure' in program && program.onFailure ? [program.onFailure] : []),
  ];
  return roots.reduce((sum, scope) => sum + visitNodes(scope, []).length, 0);
}

describe('walkProgram', () => {
  it('visits every node once, with a storage path that points at it', () => {
    fc.assert(
      fc.property(programs, (program) => {
        const walked = walkProgram(program);
        expect(walked.length).toBe(domainCount(program));
        for (const entry of walked) expect(at(program, entry.storage)).toBe(entry.node);
      }),
    );
  });

  it('reports the scope path, index and ancestor keys', () => {
    fc.assert(
      fc.property(programs, (program) => {
        const keys = new Map(walkProgram(program).map((entry) => [entry.node.key, entry]));
        for (const entry of walkProgram(program)) {
          const last = entry.storage.at(-1);
          expect(last).toBe(entry.index);
          const text = formatScopePath(entry.scope);
          if (entry.ancestors.length === 0) {
            expect(['body', 'onFailure']).toContain(text);
          } else {
            expect(text.startsWith(`${entry.ancestors.at(-1) ?? ''}.`)).toBe(true);
            for (const ancestor of entry.ancestors) expect(keys.has(ancestor)).toBe(true);
          }
        }
      }),
    );
  });

  it('walks a parent before its children and keeps list order', () => {
    const program = fc.sample(automationV3, { numRuns: 30, seed: 7 });
    for (const item of program) {
      const order = new Map(walkProgram(item).map((entry, position) => [entry.node.key, position]));
      for (const entry of walkProgram(item)) {
        for (const ancestor of entry.ancestors) {
          expect(order.get(ancestor) ?? Infinity).toBeLessThan(order.get(entry.node.key) ?? -1);
        }
      }
    }
  });
});

describe('rootScopes', () => {
  it('lists the body, and the failure scope only when it exists', () => {
    fc.assert(
      fc.property(programs, (program) => {
        const roots = rootScopes(program).map((root) => formatScopePath(root.path));
        const failure = 'onFailure' in program && program.onFailure !== undefined;
        expect(roots).toEqual(failure ? ['body', 'onFailure'] : ['body']);
      }),
    );
  });
});

describe('childScopeRefs', () => {
  it('is empty for a leaf and names every row scope', () => {
    expect(childScopeRefs({ id: 'a', key: 'leaf', kind: 'math.add' }, [])).toEqual([]);
    const id = '00000000-0000-4000-8000-00000000000b';
    const refs = childScopeRefs(
      {
        id: 'a',
        key: 'box',
        kind: 'flow.x',
        scopes: { else: { nodes: [] } },
        branches: [{ id, when: { lit: true }, scope: { nodes: [] } }],
        cases: [{ id, match: { eq: 1 }, scope: { nodes: [] } }],
        catches: [{ id, scope: { nodes: [] } }],
      },
      ['body', 'nodes', 3],
    );
    expect(refs.map((ref) => formatScopePath(ref.path))).toEqual([
      'box.else',
      `box.branch:${id}`,
      `box.case:${id}`,
      `box.catch:${id}`,
    ]);
    expect(refs.map((ref) => ref.storage.slice(3).join('.'))).toEqual([
      'scopes.else',
      'branches.0.scope',
      'cases.0.scope',
      'catches.0.scope',
    ]);
  });
});
