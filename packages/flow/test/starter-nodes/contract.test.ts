import {
  FUNCTION_V4,
  NODE_REGISTRY,
  STARTER_NODES,
  STARTER_NODE_IDS,
  STATEFUL_KIND_IDS,
  TRIGGER_KIND_PREFIX,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { check } from '../../src/check/check';
import { hasErrors, lint } from '../../src/check/lint';
import { lower } from '../../src/compile/lower';
import { interfaceHash, interfaceOf } from '../../src/functions/interface-hash';
import { indexProgram } from '../../src/program/lookup';
import { checkContext, lintContext, treeOf } from './support';

const RELEASED_INTERFACES: Readonly<Record<string, string>> = {
  [STARTER_NODE_IDS.speakOrPush]:
    'df40676be440735c77259f1e0db6c77b43c34ebce569c7052b874374c73ec71e',
  [STARTER_NODE_IDS.switchDevices]:
    '1ed883b007e88db0a9616fc6b40f5e325660c8a7bd19be135b333e7f10bb0698',
  [STARTER_NODE_IDS.lightsOffAfter]:
    'cb3060e6007bedf61a7aa1a114cac1a03c931a603ebc0506eab71da7e8900a71',
  [STARTER_NODE_IDS.flashTheLights]:
    'dd12057f00f2baf4094af25642842f4c57877d9a11ac66cf56c669c8bce5b9cc',
  [STARTER_NODE_IDS.wakeUpLight]:
    '739089bd73330def13e1e0efb92a55b709646e18a14216a47bd243cdec5dd383',
  [STARTER_NODE_IDS.leaveHomeCheck]:
    '1ac23e9b08f6730c0b3adee7060d8b9a0562a2c518e7d836750d95be2d5aec5f',
};

describe('the starter Custom Nodes', () => {
  it('are the six nodes with fixed, unique Custom Node ids and names', () => {
    const ids = STARTER_NODES.map((entry) => entry.id);
    expect(ids).toEqual(Object.values(STARTER_NODE_IDS));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(z.uuid().safeParse(id).success).toBe(true);
    const names = STARTER_NODES.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('use unique node ids', () => {
    const nodeIds = STARTER_NODES.flatMap((entry) =>
      indexProgram(treeOf(entry.program)).nodes.map((found) => found.node.id),
    );
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
  });

  it('keep the interfaces the templates were written against', () => {
    for (const entry of STARTER_NODES) {
      expect(interfaceHash(interfaceOf(entry.program)), entry.name).toBe(
        RELEASED_INTERFACES[entry.id],
      );
    }
  });

  describe.each(STARTER_NODES)('$name', ({ program }) => {
    it('parses as a graph function and checks without problems', () => {
      expect(FUNCTION_V4.safeParse(program).success).toBe(true);
      expect(check(treeOf(program), checkContext())).toEqual([]);
    });

    it('is an action of plain nodes with no trigger, kept variable or stateful node', () => {
      expect(program.flavour).toBe('action');
      expect(hasErrors(lint(treeOf(program), lintContext()))).toBe(false);
      expect(program.variables.filter((variable) => variable.persist === true)).toEqual([]);
      for (const { node } of indexProgram(treeOf(program)).nodes) {
        expect(NODE_REGISTRY.has(node.kind), node.kind).toBe(true);
        expect(node.kind.startsWith(TRIGGER_KIND_PREFIX)).toBe(false);
        expect(STATEFUL_KIND_IDS.has(node.kind)).toBe(false);
      }
    });

    it('compiles into a plan', () => {
      expect(lower(treeOf(program), { kinds: (kind) => NODE_REGISTRY.get(kind) }).ok).toBe(true);
    });
  });
});
