import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { automationV3, functionV3 } from '../../../domain/test/support/automation-v3-arbitraries';
import {
  enclosingContainers,
  execOrder,
  findById,
  findByKey,
  indexProgram,
  resolveScope,
  siblings,
} from '../../src/program/lookup';
import { formatScopePath } from '../../src/program/paths';
import { walkProgram } from '../../src/program/walk';

const programs = fc.oneof(automationV3, functionV3);

describe('indexProgram', () => {
  it('finds every node and trigger by id and by key', () => {
    fc.assert(
      fc.property(programs, (program) => {
        const index = indexProgram(program);
        for (const entry of index.nodes) {
          expect(findById(index, entry.node.id)).toBe(entry);
          expect(findByKey(index, entry.node.key)).toBe(entry);
        }
        if (program.kind === 'automation') {
          program.triggers.forEach((trigger, position) => {
            const found = findByKey(index, trigger.key);
            expect(found?.kind).toBe('trigger');
            expect(found?.node).toBe(trigger);
            expect(found?.storage).toEqual(['triggers', position]);
            expect(findById(index, trigger.id)).toBe(found);
          });
        }
      }),
    );
  });

  it('answers undefined for an unknown id or key', () => {
    const index = indexProgram(fc.sample(automationV3, 1)[0]!);
    expect(findById(index, 'missing')).toBeUndefined();
    expect(findByKey(index, 'missing')).toBeUndefined();
  });

  it('keeps the first entry when an id or key repeats', () => {
    const id = '00000000-0000-4000-8000-00000000000a';
    const index = indexProgram({
      version: 3,
      kind: 'function',
      flavour: 'pure',
      inputs: [],
      outputs: [],
      exits: ['done'],
      variables: [],
      body: {
        nodes: [
          { id, key: 'dup', kind: 'math.add', label: 'first' },
          { id, key: 'dup', kind: 'math.add', label: 'second' },
        ],
      },
    });
    expect(findByKey(index, 'dup')?.node).toMatchObject({ label: 'first' });
    expect(findById(index, id)?.node).toMatchObject({ label: 'first' });
  });
});

describe('enclosingContainers', () => {
  it('lists containers from the outermost to the innermost', () => {
    fc.assert(
      fc.property(programs, (program) => {
        const index = indexProgram(program);
        for (const entry of index.nodes) {
          expect(enclosingContainers(index, entry.node.key).map((node) => node.key)).toEqual(
            entry.ancestors,
          );
        }
      }),
    );
  });

  it('is empty for a trigger and for an unknown key', () => {
    const program = fc.sample(
      automationV3.filter((p) => p.triggers.length > 0),
      1,
    )[0]!;
    const index = indexProgram(program);
    expect(enclosingContainers(index, program.triggers[0]!.key)).toEqual([]);
    expect(enclosingContainers(index, 'missing')).toEqual([]);
  });
});

describe('siblings', () => {
  it('lists the nodes sharing a scope, in list order', () => {
    fc.assert(
      fc.property(programs, (program) => {
        const index = indexProgram(program);
        for (const entry of index.nodes) {
          const group = siblings(index, entry.node.key);
          expect(group).toContain(entry.node);
          expect(group[entry.index]).toBe(entry.node);
        }
      }),
    );
  });

  it('is empty for a trigger and for an unknown key', () => {
    const program = fc.sample(
      automationV3.filter((p) => p.triggers.length > 0),
      1,
    )[0]!;
    const index = indexProgram(program);
    expect(siblings(index, program.triggers[0]!.key)).toEqual([]);
    expect(siblings(index, 'missing')).toEqual([]);
  });
});

describe('resolveScope', () => {
  it('resolves every walked scope path to the scope that holds the node', () => {
    fc.assert(
      fc.property(programs, (program) => {
        const index = indexProgram(program);
        for (const entry of index.nodes) {
          const scope = resolveScope(index, entry.scope);
          expect(scope?.nodes[entry.index]).toBe(entry.node);
        }
      }),
    );
  });

  it('is undefined for a missing owner, a missing scope and a missing failure scope', () => {
    const program = fc.sample(
      automationV3.filter((p) => p.onFailure === undefined),
      1,
    )[0]!;
    const index = indexProgram(program);
    expect(resolveScope(index, { t: 'root', root: 'onFailure' })).toBeUndefined();
    expect(resolveScope(index, { t: 'root', root: 'body' })).toBe(program.body);
    expect(
      resolveScope(index, { t: 'child', key: 'missing', part: { kind: 'scope', name: 'body' } }),
    ).toBeUndefined();
    const trigger = program.triggers[0];
    if (trigger !== undefined) {
      expect(
        resolveScope(index, {
          t: 'child',
          key: trigger.key,
          part: { kind: 'scope', name: 'body' },
        }),
      ).toBeUndefined();
    }
    const owner = walkProgram(program)[0];
    if (owner !== undefined) {
      expect(
        resolveScope(index, {
          t: 'child',
          key: owner.node.key,
          part: { kind: 'scope', name: 'nothing' },
        }),
      ).toBeUndefined();
    }
  });

  it('resolves the failure scope when present', () => {
    const program = fc.sample(
      automationV3.filter((p) => p.onFailure !== undefined),
      1,
    )[0]!;
    expect(resolveScope(indexProgram(program), { t: 'root', root: 'onFailure' })).toBe(
      program.onFailure,
    );
    expect(formatScopePath({ t: 'root', root: 'onFailure' })).toBe('onFailure');
  });
});

describe('execOrder', () => {
  it('keeps the walk order of the nodes the predicate accepts', () => {
    fc.assert(
      fc.property(programs, (program) => {
        const index = indexProgram(program);
        const isExec = (kind: string): boolean => kind !== 'math.add';
        const order = execOrder(index, isExec);
        expect(order.map((entry) => entry.node.key)).toEqual(
          index.nodes
            .filter((entry) => entry.node.kind !== 'math.add')
            .map((entry) => entry.node.key),
        );
      }),
    );
  });
});
