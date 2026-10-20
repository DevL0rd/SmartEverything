import { FLOW_SCOPE_OUTPUTS, NODE_REGISTRY } from '@smarteverything/domain';
import type { AutomationV3 } from '@smarteverything/domain';
import type { LintContext } from '@smarteverything/flow/check/lint';
import { describe, expect, it } from 'vitest';
import { DocumentStore } from '../../model/editor/document-store';
import { automation, step } from '../../model/editor/editor-fixtures';
import { applyFix } from './fix-actions';
import { PROGRAM_GROUP_TITLE, findingById, inspectorFindings, runLiveCheck } from './problem-model';

const context: LintContext = {
  kinds: (id) => NODE_REGISTRY.get(id),
  scopeOutputs: (kind) => FLOW_SCOPE_OUTPUTS[kind] ?? [],
  references: () => true,
  functions: () => undefined,
  secrets: new Set(),
  automations: () => undefined,
};

function stormOff(): AutomationV3 {
  return {
    ...automation([]),
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

  it('projects an error onto its card, its group and the inspector, and blocks publishing', () => {
    const broken = step('broken', {}, { kind: 'nope.missing' });
    const program = automation([broken, step('fine', {}, { kind: 'nope.other' })]);
    const check = runLiveCheck(program, context, NODE_REGISTRY);
    expect(check.blocking).toBe(true);
    expect(check.scene).toContainEqual(
      expect.objectContaining({ nodeId: broken.id, severity: 'critical' }),
    );
    const group = check.groups.find((entry) => entry.nodeId === broken.id);
    expect(group?.title).toBe('Missing');
    const inspector = inspectorFindings(check.findings, broken.id);
    expect(inspector[0]).toMatchObject({ severity: 'error' });
    expect(findingById(check, inspector[0]?.id ?? '')?.code).toBe('unknown_kind');
  });

  it('turns storm protection on with one op, keeps other overrides and clears the warning', () => {
    const store = new DocumentStore(stormOff());
    const check = runLiveCheck(store.state.get().program, context, NODE_REGISTRY);
    const found = check.findings[0]?.finding;
    expect(found?.code).toBe('storm_protection_off');
    const result =
      found === undefined ? null : applyFix(store.apply, store.state.get().program, found);
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
