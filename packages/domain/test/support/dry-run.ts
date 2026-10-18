import {
  AutomationBindingError,
  resolveAutomationInput,
  resolveCommandInput,
} from '../../src/automation-bindings';
import {
  conditionsHold,
  type AutomationDefinition,
  type ConditionContext,
} from '../../src/automations';
import type { Action } from '../../src/automation-actions';
import type { JsonValue } from '../../src/values';
import {
  conditionV2Holds,
  resolveInputV2,
  resolveToV2,
  type ContextV2,
} from '../../src/automation-v2-eval';
import type { AutomationV2, StepV2 } from '../../src/automation-v2-schema';
import { setOutline, stable, type Outline } from './outline-text';
import { isDevice, setPartsV1, stepOutlineV1, type DeviceAction } from './outline-v1';
import { setPartsV2, stepOutlineV2 } from './outline-v2';

const CAP = 3;

function toText(value: JsonValue): string {
  return stable(value);
}

function toV1(action: DeviceAction, context: ConditionContext): string | null {
  if (action.type === 'temporary_effect')
    return action.operation.type === 'set' ? toText(action.operation.value) : null;
  if (!('binding' in action)) return toText(action.value);
  if (context.bindings === undefined) throw new AutomationBindingError('no reader');
  return toText(resolveCommandInput(action.binding, context.bindings));
}

function repeatsV1(action: Extract<Action, { type: 'repeat' }>): number {
  return action.repeat.mode === 'count' ? Math.min(action.repeat.count, CAP) : CAP;
}

function repeatV1(
  action: Extract<Action, { type: 'repeat' }>,
  context: ConditionContext,
  out: Outline[],
): void {
  const { repeat } = action;
  for (let turn = 0; turn < repeatsV1(action); turn += 1) {
    if (repeat.mode === 'while' && !conditionsHold(repeat.conditions, context)) return;
    runV1(action.actions, context, out);
    if (repeat.mode === 'until' && conditionsHold(repeat.conditions, context)) return;
  }
}

function sequenceV1(
  action: Extract<Action, { type: 'sequence' }>,
  context: ConditionContext,
): Outline {
  const { bindings } = context;
  if (bindings === undefined) throw new AutomationBindingError('no reader');
  return {
    step: 'run',
    id: action.nodeId,
    automation: action.sequenceId,
    inputs: Object.fromEntries(
      Object.entries(action.parameters).map(([name, input]) => [
        name,
        toText(resolveAutomationInput(input, bindings)),
      ]),
    ),
    wait: true,
  };
}

function stepV1(action: Action, context: ConditionContext, out: Outline[]): void {
  if (isDevice(action)) {
    out.push(setOutline({ ...setPartsV1(action), to: toV1(action, context) }));
  } else if (action.type === 'choose') {
    const branch = action.branches.find((entry) => conditionsHold(entry.conditions, context));
    runV1(branch?.actions ?? action.otherwise ?? [], context, out);
  } else if (action.type === 'repeat') {
    repeatV1(action, context, out);
  } else {
    out.push(action.type === 'sequence' ? sequenceV1(action, context) : stepOutlineV1(action));
  }
}

function runV1(actions: readonly Action[], context: ConditionContext, out: Outline[]): void {
  for (const action of actions) {
    try {
      stepV1(action, context, out);
    } catch (error) {
      if (!(error instanceof AutomationBindingError)) throw error;
      out.push({ error: 'binding' });
    }
  }
}

export function dryRunV1(definition: AutomationDefinition, context: ConditionContext): Outline[] {
  const out: Outline[] = [];
  try {
    if (conditionsHold(definition.conditions, context)) runV1(definition.actions, context, out);
  } catch (error) {
    if (!(error instanceof AutomationBindingError)) throw error;
    out.push({ error: 'binding' });
  }
  return out;
}

function toV2(step: Extract<StepV2, { do: 'set' }>, context: ContextV2): string | null {
  return step.to === undefined ? null : toText(resolveToV2(step.to, context));
}

function repeatV2(
  step: Extract<StepV2, { do: 'repeat' }>,
  context: ContextV2,
  out: Outline[],
): void {
  const turns = step.times === undefined ? CAP : Math.min(step.times, CAP);
  for (let turn = 0; turn < turns; turn += 1) {
    if (step.while !== undefined && !conditionV2Holds(step.while, context)) return;
    runV2(step.steps, context, out);
    if (step.until !== undefined && conditionV2Holds(step.until, context)) return;
  }
}

function runStepV2(step: Extract<StepV2, { do: 'run' }>, context: ContextV2): Outline {
  return {
    step: 'run',
    id: step.id ?? null,
    automation: step.automation,
    inputs: Object.fromEntries(
      Object.entries(step.inputs ?? {}).map(([name, input]) => [
        name,
        toText(resolveInputV2(input, context)),
      ]),
    ),
    wait: step.wait ?? false,
  };
}

function stepV2(step: StepV2, context: ContextV2, out: Outline[]): void {
  if (step.do === 'set') {
    out.push(setOutline({ ...setPartsV2(step), to: toV2(step, context) }));
  } else if (step.do === 'if') {
    const branch = step.branches.find((entry) => conditionV2Holds(entry.when, context));
    runV2(branch?.then ?? step.else ?? [], context, out);
  } else if (step.do === 'repeat') {
    repeatV2(step, context, out);
  } else {
    out.push(step.do === 'run' ? runStepV2(step, context) : stepOutlineV2(step));
  }
}

function runV2(steps: readonly StepV2[], context: ContextV2, out: Outline[]): void {
  for (const step of steps) {
    try {
      stepV2(step, context, out);
    } catch (error) {
      if (!(error instanceof AutomationBindingError)) throw error;
      out.push({ error: 'binding' });
    }
  }
}

export function dryRunV2(automation: AutomationV2, context: ContextV2): Outline[] {
  const out: Outline[] = [];
  try {
    if (automation.onlyIf === undefined || conditionV2Holds(automation.onlyIf, context))
      runV2(automation.steps, context, out);
  } catch (error) {
    if (!(error instanceof AutomationBindingError)) throw error;
    out.push({ error: 'binding' });
  }
  return out;
}
