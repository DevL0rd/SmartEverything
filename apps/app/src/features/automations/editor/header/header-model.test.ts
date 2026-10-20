import { describe, expect, it } from 'vitest';
import type {
  AutomationV3,
  InputPort,
  OutputPort,
  TriggerNode,
  Variable,
} from '@smarteverything/domain';
import { AUTOMATION_V3, NODE_REGISTRY } from '@smarteverything/domain';
import { applyPatch } from '@smarteverything/flow/ops/reducer';
import type { PatchOp } from '@smarteverything/flow/ops/schema';
import {
  LIMIT_ROWS,
  isCustom,
  stormAllOff,
  limitAction,
  limitValue,
  stormAllOn,
  stormOn,
  withLimit,
  withStorm,
} from './budgets-model';
import {
  addInput,
  addOutput,
  defaultInput,
  inputLine,
  optionalOutput,
  portProblem,
  relabelInput,
  removeInput,
  renameInput,
  requireInput,
  retypeInput,
  retypeOutput,
} from './io-model';
import {
  BUTTON_HINT,
  DEFAULT_MAX,
  maxSummary,
  needsButtonHint,
  policyOp,
  withMax,
  withMaxWait,
  withMode,
  withRunTimeout,
} from './policy-model';
import {
  defaultTiming,
  stripBars,
  stripSummary,
  timingNamesOf,
  timingOps,
  timingValuesOf,
} from './timing-model';
import { initialFor } from './type-choices';
import {
  addVariable,
  removeVariable,
  renameVariable,
  retypeVariable,
  setInitial,
  setKeep,
  variableProblem,
} from './variables-model';

const TRIGGER_ID = '00000000-0000-4000-8000-0000000000a1';

function trigger(kind: string, ports: TriggerNode['ports'] = {}): TriggerNode {
  return { id: TRIGGER_ID, key: 'when', kind, ports };
}

function automation(extra: Partial<AutomationV3> = {}): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    body: { nodes: [] },
    policy: { mode: 'single' },
    ...extra,
  };
}

function applied(program: AutomationV3, op: PatchOp | readonly PatchOp[]): AutomationV3 {
  const result = applyPatch(program, Array.isArray(op) ? op : [op]);
  if (!result.ok) throw new Error(result.reason);
  return AUTOMATION_V3.parse(result.program);
}

describe('run behaviour', () => {
  it('writes max 10 when a queue is chosen and drops it for one at a time', () => {
    const queued = withMode({ mode: 'single' }, 'queue');
    expect(queued).toEqual({ mode: 'queue', max: DEFAULT_MAX });
    expect(withMode({ ...queued, maxWait: 5000 }, 'single')).toEqual({ mode: 'single' });
  });

  it('keeps an automation without a max unlimited until the person sets one', () => {
    const queued = { mode: 'queue' } as const;
    expect(maxSummary(queued)).toBe('No limit');
    expect(withMax({ mode: 'queue', max: 4 }, null)).toEqual({ mode: 'queue' });
    expect(maxSummary(withMax(queued, 3))).toBe('Up to 3');
  });

  it('sets and clears the wait and the run time limit', () => {
    const policy = withRunTimeout(withMaxWait({ mode: 'queue', max: 2 }, 3000), 9000);
    expect(policy).toEqual({ mode: 'queue', max: 2, maxWait: 3000, timeout: 9000 });
    expect(withRunTimeout(withMaxWait(policy, null), null)).toEqual({ mode: 'queue', max: 2 });
  });

  it('goes through the header op and survives the schema', () => {
    const next = applied(automation(), policyOp(withMode({ mode: 'single' }, 'parallel')));
    expect(next.policy).toEqual({ mode: 'parallel', max: DEFAULT_MAX });
  });

  it('hints at Queue only for a button trigger on one at a time', () => {
    const button = automation({ triggers: [trigger('trigger.button')] });
    expect(needsButtonHint(button)).toBe(true);
    expect(BUTTON_HINT).toContain('Use Queue');
    expect(needsButtonHint({ ...button, policy: { mode: 'queue' } })).toBe(false);
    expect(needsButtonHint(automation({ triggers: [trigger('trigger.time')] }))).toBe(false);
  });
});

describe('storm protection and budgets', () => {
  it('reads absent switches as on and all three off as storm protection off', () => {
    expect(stormOn(undefined, 'feedback')).toBe(true);
    expect(stormAllOff(automation())).toBe(false);
    const allOff = automation({ budgets: { startBucket: 'off', feedback: 'off', effects: 'off' } });
    expect(stormAllOff(allOff)).toBe(true);
    expect(stormOn(allOff.budgets, 'effects')).toBe(false);
  });

  it('turns one switch and then all of them on through the header op', () => {
    const allOff = automation({ budgets: { startBucket: 'off', feedback: 'off', effects: 'off' } });
    const one = applied(allOff, withStorm(allOff.budgets, 'feedback', true));
    expect(one.budgets).toEqual({ startBucket: 'off', feedback: 'on', effects: 'off' });
    expect(stormAllOff(one)).toBe(false);
    const all = applied(one, stormAllOn(one.budgets));
    expect(all.budgets).toEqual({ startBucket: 'on', feedback: 'on', effects: 'on' });
  });

  it('keeps the numeric limits and clears budgets that end up empty', () => {
    const row = LIMIT_ROWS[0];
    if (row === undefined) throw new Error('no limit rows');
    expect(limitValue(undefined, row)).toBe(row.fallback);
    const raised = applied(automation(), withLimit(undefined, row.name, 500));
    expect(raised.budgets).toEqual({ [row.name]: 500 });
    expect(isCustom(raised.budgets, row)).toBe(true);
    const cleared = applied(raised, withLimit(raised.budgets, row.name, null));
    expect(cleared.budgets).toBeUndefined();
  });
});

describe('limits without arbitrary defaults', () => {
  it('offers every run limit as an optional setting with no limit by default', () => {
    const names = LIMIT_ROWS.map((row) => row.name);
    expect(names).not.toContain('callDepth');
    for (const row of LIMIT_ROWS.filter((each) => each.name !== 'commandsPerMinute')) {
      expect(row.fallback).toBeNull();
      expect(limitValue(undefined, row)).toBeNull();
    }
  });

  it('keeps the device command rate as the one default', () => {
    const rate = LIMIT_ROWS.find((row) => row.name === 'commandsPerMinute');
    expect(rate?.fallback).toBe(600);
  });

  it('sets a limit from no limit and goes back to no limit or the default', () => {
    const [steps] = LIMIT_ROWS;
    const rate = LIMIT_ROWS.find((row) => row.name === 'commandsPerMinute');
    if (steps === undefined || rate === undefined) throw new Error('no limit rows');
    expect(limitAction(steps, null, false)).toEqual({ label: 'Set a limit', next: steps.start });
    expect(limitAction(steps, 500, true)).toEqual({ label: 'No limit', next: null });
    expect(limitAction(rate, 600, false)).toBeNull();
    expect(limitAction(rate, 30, true)).toEqual({ label: 'Use default', next: null });
  });
});

describe('trigger timing', () => {
  it('lists only the timing options the trigger kind declares', () => {
    expect(timingNamesOf(NODE_REGISTRY.get('trigger.signal'))).toEqual(
      expect.arrayContaining(['hold', 'debounce', 'cooldown']),
    );
    expect(timingNamesOf(NODE_REGISTRY.get('trigger.time'))).toEqual([]);
    expect(timingNamesOf(undefined)).toEqual([]);
  });

  it('draws the bars in the order things happen and the cooldown after the firing', () => {
    const node = trigger('trigger.signal', {
      cooldown: { lit: 60_000 },
      hold: { lit: 10_000 },
      debounce: { lit: 2000 },
    });
    const bars = stripBars(timingValuesOf(node));
    expect(bars.map((bar) => [bar.name, bar.phase])).toEqual([
      ['debounce', 'before'],
      ['hold', 'before'],
      ['cooldown', 'after'],
    ]);
    expect(bars[2]?.caption).toBe('1 minute');
    expect(bars[2]?.weight).toBeGreaterThan(bars[0]?.weight ?? 0);
    expect(stripSummary(timingValuesOf(node))).toBe(
      'Settle 2 seconds, then Hold 10 seconds, then fires, then Cooldown 1 minute.',
    );
  });

  it('reads a window and a re-arm value and describes an untimed trigger', () => {
    const node = trigger('trigger.signal', {
      window: { lit: { of: 'avg', seconds: 120 } },
      rearm: { lit: 20 },
    });
    const values = timingValuesOf(node);
    expect(values.window).toEqual({ of: 'avg', seconds: 120 });
    expect(stripBars(values)[0]?.caption).toBe('2 minutes');
    expect(stripSummary(values)).toContain('crosses back past 20');
    expect(stripSummary(timingValuesOf(trigger('trigger.signal')))).toBe(
      'It fires as soon as the trigger matches.',
    );
  });

  it('turns an option on with its default and off again through set and unset ops', () => {
    const base = automation({ triggers: [trigger('trigger.signal')] });
    const withHold = applied(base, timingOps('when', 'hold', defaultTiming('hold')));
    expect(withHold.triggers[0]?.ports['hold']).toEqual({ lit: 10_000 });
    const without = applied(withHold, timingOps('when', 'hold', null));
    expect(without.triggers[0]?.ports['hold']).toBeUndefined();
  });
});

describe('run variables', () => {
  const start: Variable[] = [{ name: 'level', type: { t: 'number' }, initial: { lit: 1 } }];

  it('adds, renames, retypes, keeps and removes through the header op', () => {
    let program = automation({ variables: start });
    program = applied(program, addVariable(program.variables));
    expect(program.variables.map((variable) => variable.name)).toEqual(['level', 'variable2']);
    program = applied(program, renameVariable(program.variables, 'variable2', 'name'));
    program = applied(program, retypeVariable(program.variables, 'name', 'text'));
    expect(program.variables[1]).toMatchObject({ type: { t: 'text' }, initial: { lit: '' } });
    program = applied(program, setKeep(program.variables, 'level', true));
    expect(program.variables[0]?.persist).toBe(true);
    program = applied(program, setKeep(program.variables, 'level', false));
    expect(program.variables[0]?.persist).toBeUndefined();
    program = applied(program, setInitial(program.variables, 'level', { lit: 5 }));
    expect(program.variables[0]?.initial).toEqual({ lit: 5 });
    program = applied(program, removeVariable(program.variables, 'name'));
    expect(program.variables).toHaveLength(1);
  });

  it('refuses names that are used, reserved or not identifiers', () => {
    expect(variableProblem(start, 'other', 'level')).toBe('That name is already used.');
    expect(variableProblem(start, 'level', 'level')).toBeUndefined();
    expect(variableProblem(start, 'other', 'Bad name')).toContain('lowercase');
    expect(variableProblem(start, 'other', 'vars')).toContain('lowercase');
  });

  it('gives each type a start value', () => {
    expect(initialFor({ t: 'boolean' })).toEqual({ lit: false });
    expect(initialFor({ t: 'list', of: { t: 'text' } })).toEqual({ lit: [] });
  });
});

describe('inputs and outputs', () => {
  it('edits an input end to end and drops the default when it becomes required', () => {
    let program = automation();
    program = applied(program, addInput(program.inputs));
    expect(program.inputs[0]).toEqual({ name: 'input1', type: { t: 'text' }, required: false });
    program = applied(program, renameInput(program.inputs, 'input1', 'target'));
    program = applied(program, relabelInput(program.inputs, 'target', ' Target level '));
    program = applied(program, retypeInput(program.inputs, 'target', 'number'));
    program = applied(program, defaultInput(program.inputs, 'target', 40));
    expect(program.inputs[0]).toMatchObject({
      label: 'Target level',
      type: { t: 'number' },
      default: 40,
    });
    program = applied(program, requireInput(program.inputs, 'target', true));
    expect(program.inputs[0]).toMatchObject({ required: true });
    expect(program.inputs[0]?.default).toBeUndefined();
    const first: InputPort | undefined = program.inputs[0];
    expect(first === undefined ? '' : inputLine(first)).toBe('Number, required');
    program = applied(program, removeInput(program.inputs, 'target'));
    expect(program.inputs).toEqual([]);
  });

  it('adds, retypes and marks outputs optional', () => {
    let program = automation();
    program = applied(program, addOutput(program.outputs));
    program = applied(program, retypeOutput(program.outputs, 'result1', 'boolean'));
    program = applied(program, optionalOutput(program.outputs, 'result1', true));
    const output: OutputPort | undefined = program.outputs[0];
    expect(output).toEqual({ name: 'result1', type: { t: 'boolean' }, optional: true });
    program = applied(program, optionalOutput(program.outputs, 'result1', false));
    expect(program.outputs[0]?.optional).toBeUndefined();
  });

  it('checks a new port name against the others', () => {
    const ports = [{ name: 'a' }, { name: 'b' }];
    expect(portProblem(ports, 'a', 'b')).toBe('That name is already used.');
    expect(portProblem(ports, 'a', 'a')).toBeUndefined();
    expect(portProblem(ports, 'a', 'c')).toBeUndefined();
  });
});
