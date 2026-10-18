import { describe, expect, it } from 'vitest';
import { AUTOMATION_V2, type AutomationV2, type StepV2 } from '@smarteverything/domain';
import {
  CONDITION_KINDS,
  STEP_KINDS,
  TRIGGER_KINDS,
  blankCondition,
  blankStep,
  blankTrigger,
  runStepFor,
  stepAvailable,
  triggerAvailable,
  valueStepFor,
} from './blanks';
import { catalogFixture, valueRow, withComputer } from './catalog-fixture';

const WAIT: StepV2 = { do: 'wait', ms: 1000 };

function parses(change: Partial<AutomationV2>): boolean {
  return AUTOMATION_V2.safeParse({ when: [{ on: 'time', at: '07:00' }], steps: [WAIT], ...change })
    .success;
}

describe('the things the editor can add', () => {
  const catalog = withComputer(
    catalogFixture({
      callable: [
        { id: '70000000-0000-4000-8000-000000000001', name: 'Fade', reusable: true, inputs: [] },
      ],
    }),
  );

  it('builds a valid trigger for every kind of trigger', () => {
    for (const kind of TRIGGER_KINDS) {
      const trigger = blankTrigger(kind, catalog);
      expect(trigger, kind).not.toBeNull();
      if (trigger !== null && kind !== 'speech')
        expect(parses({ when: [trigger] }), kind).toBe(true);
    }
  });

  it('builds a valid condition for every kind of condition', () => {
    for (const kind of CONDITION_KINDS) {
      const condition = blankCondition(kind, catalog);
      expect(condition, kind).not.toBeNull();
      if (condition !== null) expect(parses({ onlyIf: condition }), kind).toBe(true);
    }
  });

  it('builds a valid step for every kind of step', () => {
    for (const kind of STEP_KINDS) {
      const step = blankStep(kind, catalog);
      expect(step, kind).not.toBeNull();
      if (
        step !== null &&
        kind !== 'notify' &&
        kind !== 'ai' &&
        kind !== 'tool' &&
        kind !== 'speak'
      )
        expect(parses({ steps: [step] }), kind).toBe(true);
    }
  });

  it('gives every new thing its own identity', () => {
    const first = blankStep('wait', catalog);
    const second = blankStep('wait', catalog);
    expect(first?.id).toBeDefined();
    expect(first?.id).not.toBe(second?.id);
  });

  it('starts a Control step on the first device that can be controlled', () => {
    const step = blankStep('set', catalog);
    expect(step).toMatchObject({ do: 'set', control: 'power', to: true });
  });

  it('says which kinds need something that does not exist yet', () => {
    const bare = catalogFixture({ scenes: [], values: [], callable: [], wakeProfileId: null });
    expect(stepAvailable('scene', bare)).toBe(false);
    expect(stepAvailable('value', bare)).toBe(false);
    expect(stepAvailable('run', bare)).toBe(false);
    expect(stepAvailable('ai', bare)).toBe(false);
    expect(stepAvailable('audio', bare)).toBe(false);
    expect(stepAvailable('display', bare)).toBe(false);
    expect(stepAvailable('audio', withComputer(bare))).toBe(true);
    expect(blankStep('display', bare)).toBeNull();
    expect(stepAvailable('wait', bare)).toBe(true);
    expect(triggerAvailable('device', catalogFixture({ devices: [], allDevices: [] }))).toBe(false);
    expect(blankStep('scene', bare)).toBeNull();
  });

  it('starts a run step with a value for every input the callee declares', () => {
    const step = runStepFor({
      id: '70000000-0000-4000-8000-000000000002',
      name: 'Fade',
      reusable: true,
      inputs: [
        { name: 'level', type: 'number' },
        { name: 'on', type: 'flag' },
      ],
    });
    expect(step).toMatchObject({ wait: true, inputs: { level: 0, on: false } });
    expect(parses({ steps: [step] })).toBe(true);
  });

  it('starts a Value step with the change that suits the Value', () => {
    expect(valueStepFor(valueRow())).toMatchObject({ op: 'set', amount: 2 });
  });
});
