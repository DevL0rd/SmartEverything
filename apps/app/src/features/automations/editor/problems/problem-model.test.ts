import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { FLOW_SCOPE_OUTPUTS, NODE_REGISTRY, type ProgramV4 } from '@smarteverything/domain';
import type { LintContext } from '@smarteverything/flow/check/lint';
import { describe, expect, it } from 'vitest';
import { DocumentStore } from '../../model/editor/document-store';
import { automation, gnode, idOf, note, start } from '../../model/graph/graph-scene-fixtures';
import { applyFix } from './fix-actions';
import {
  PROGRAM_GROUP_TITLE,
  findingById,
  inspectorFindings,
  runLiveCheck,
  sceneProblems,
  type LiveFinding,
} from './problem-model';

const context: LintContext = {
  kinds: (id) => NODE_REGISTRY.get(id),
  scopeOutputs: (kind) => FLOW_SCOPE_OUTPUTS[kind] ?? [],
  references: () => true,
  functions: () => undefined,
  secrets: new Set(),
  automations: () => undefined,
};

function stormOff(): ProgramV4 {
  return {
    ...automation([start()], { triggers: [] }),
    budgets: { startBucket: 'off', feedback: 'off', effects: 'off', stepsTotal: 50 },
  };
}

describe('live problems projection', () => {
  it('puts a program level warning in the automation group without a card problem', () => {
    const check = runLiveCheck(stormOff(), context, NODE_REGISTRY);
    const [group] = check.groups;
    expect(group).toMatchObject({ nodeId: null, title: PROGRAM_GROUP_TITLE });
    expect(group?.items[0]).toMatchObject({ severity: 'warning', fixable: true });
    expect(check.scene).toEqual([]);
    expect(check.counts).toEqual({ errors: 0, warnings: 1, hints: 0 });
    expect(check.blocking).toBe(false);
  });

  it('marks a card only for an error, never for a warning or a hint on that step', () => {
    const finding = (severity: LiveFinding['severity']): LiveFinding => ({
      id: severity,
      nodeId: 'n1',
      severity,
      code: severity,
      message: `A ${severity}`,
      port: undefined,
      fix: undefined,
      action: undefined,
    });
    const marked = sceneProblems([finding('error'), finding('warning'), finding('hint')]);
    expect(marked.map((entry) => entry.code)).toEqual(['error']);
    expect(marked[0]?.message).toBe('A error');
  });

  it('projects an error onto its card, its group and the inspector, and blocks publishing', () => {
    const program = automation([start('broken'), gnode('broken', 'device.set')], {
      triggers: [],
    });
    const check = runLiveCheck(program, context, NODE_REGISTRY);
    expect(check.blocking).toBe(true);
    expect(check.scene).toContainEqual(
      expect.objectContaining({ nodeId: idOf('broken'), code: 'missing_port' }),
    );
    const group = check.groups.find((entry) => entry.nodeId === idOf('broken'));
    expect(group?.title).toBe(NODE_REGISTRY.get('device.set')?.name);
    const inspector = inspectorFindings(check.findings, idOf('broken'));
    expect(inspector[0]).toMatchObject({ severity: 'error' });
    expect(findingById(check, inspector[0]?.id ?? '')?.code).toBe('missing_port');
  });

  it('lists the structure problems of a program that cannot be read as steps', () => {
    const loose = automation([start('a'), note('a'), note('stray')], { triggers: [] });
    const found = runLiveCheck(loose, context, NODE_REGISTRY);
    expect(found.findings.map((item) => item.code)).toEqual(['never_runs']);
    expect(found.findings[0]).toMatchObject({ severity: 'error', nodeId: idOf('stray') });
    expect(found.scene).toEqual([]);
    expect(found.blocking).toBe(true);
  });

  it('turns storm protection on with one op, keeps other overrides and clears the warning', () => {
    const store = new DocumentStore(stormOff(), STATIC_KIND_LOOKUP);
    const check = runLiveCheck(store.state.get().program, context, NODE_REGISTRY);
    const found = check.findings[0];
    expect(found?.code).toBe('storm_protection_off');
    const result =
      found === undefined
        ? null
        : applyFix(store.apply, store.state.get().program, found, STATIC_KIND_LOOKUP);
    expect(result?.ok).toBe(true);
    const program = store.state.get().program;
    expect(program.kind === 'automation' ? program.budgets : null).toEqual({
      startBucket: 'on',
      feedback: 'on',
      effects: 'on',
      stepsTotal: 50,
    });
    expect(runLiveCheck(program, context, NODE_REGISTRY).findings).toEqual([]);
    store.undo();
    expect(runLiveCheck(store.state.get().program, context, NODE_REGISTRY).counts.warnings).toBe(1);
  });
});
