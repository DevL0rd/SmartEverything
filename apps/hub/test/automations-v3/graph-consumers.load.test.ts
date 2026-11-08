import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { AutomationV4 } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { graphAutomation } from './support/graph-of';
import { closeSetups, lit, node, program, rigV3 } from './support/rig-v3';
import { captureLogs } from '../support/logs';
import {
  UnstructuredStoredProgramError,
  flatAutomation,
  readAutomation,
  structuredAutomation,
} from '../../src/store/repositories/automation-trees';

afterEach(closeSetups);

const CONSUMERS = [
  '../../src/automations/engine-v3-admission',
  '../../src/automations/engine-v3-start',
  '../../src/automations/engine-v3-rehearsal',
  '../../src/automations/engine-v3-plans',
  '../../src/automations/engine-v3',
  '../../src/automations/kept-data-prune',
  '../../src/automations/hub-engine',
  '../../src/automations/service-programs',
  '../../src/automations/service-programs-analysis',
  '../../src/automations/service-programs-compare',
  '../../src/automations/service-programs-history',
  '../../src/automations/service-programs-outline',
  '../../src/automations/service-programs-speech',
  '../../src/automations/service-functions',
  '../../src/automations/service-functions-callers',
  '../../src/automations/service-functions-extract',
  '../../src/automations/service-functions-support',
  '../../src/automations/service-reach',
  '../../src/store/repositories/automation-programs',
  '../../src/store/repositories/automation-revisions',
  '../../src/store/repositories/automation-values',
  '../../src/store/repositories/automation-functions',
  '../../src/store/repositories/automation-trees',
] as const;

function loose(): AutomationV4 {
  const graph = graphAutomation(
    program([node('say', 'debug.log', { message: lit('hi') })]),
    STATIC_KIND_LOOKUP,
  );
  return {
    ...graph,
    nodes: graph.nodes.map((entry) =>
      entry.kind === 'flow.start' ? { id: entry.id, key: entry.key, kind: entry.kind } : entry,
    ),
  };
}

describe('every consumer of stored programs loads', () => {
  it.each(CONSUMERS)('imports %s', async (path) => {
    const loaded: unknown = await import(path);
    expect(loaded).toBeTypeOf('object');
  });
});

describe('reading a stored program as a tree', () => {
  it('returns the tree of a valid graph and names the problems of one that does not structure', () => {
    const valid = graphAutomation(
      program([node('say', 'debug.log', { message: lit('hi') })]),
      STATIC_KIND_LOOKUP,
    );
    expect(
      structuredAutomation(valid, STATIC_KIND_LOOKUP).body.nodes.map((entry) => entry.key),
    ).toStrictEqual(['say']);
    const read = readAutomation(loose(), STATIC_KIND_LOOKUP);
    expect(read.ok).toBe(false);
    expect(() => structuredAutomation(loose(), STATIC_KIND_LOOKUP)).toThrow(
      UnstructuredStoredProgramError,
    );
  });

  it('gives every node of an unstructured graph to a reference scan', () => {
    expect(flatAutomation(loose()).body.nodes.map((entry) => entry.key)).toContain('say');
  });
});

describe('loading a stored program that does not structure', () => {
  it('refuses it with the graph problems in the log and keeps the hub running', async () => {
    const logs = captureLogs();
    const rig = await rigV3();
    const stored = rig.programs.create(
      {
        name: 'Loose',
        enabled: true,
        program: loose(),
        layout: { nodes: {}, frames: [], comments: [] },
        planHash: 'a'.repeat(64),
        origin: null,
        author: null,
      },
      STATIC_KIND_LOOKUP,
    );
    const good = rig.add(program([node('wait', 'flow.wait', { duration: lit(1) })]), 'Good');
    const report = rig.engine.sync();
    expect(report).toMatchObject({ loaded: 1, refused: 1 });
    expect(logs.events()).toContain('automation.not_loaded');
    expect(stored.id).not.toBe(good.id);
  });
});
